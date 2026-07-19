import fs from 'fs';
import path from 'path';
import Docker from 'dockerode';
import semver from 'semver';
import { parse as parseToml } from 'smol-toml';
import { config, resultsDir } from '../config';
import { diagnoseFailure } from '../ai/diagnose';
import { runFixAttempt } from '../ai/fixLoop';
import { reflectOnAttempt } from '../ai/reflect';
import { Reflection, ToolExecutors } from '../ai/types';
import { appendAttempt, getJob, updateJob } from '../jobs/store';
import { detectStack, ScopedExec } from '../stack/detect';
import { logEvent } from '../utils/logger';
import { StackInfo } from '../types';
import { copyFileFromContainer, createJobContainer, destroyContainer, execInContainer, ExecResult } from './docker';

const RESULT_ZIP_PATH_IN_CONTAINER = '/tmp/result.zip';

export function jobWorkdir(jobId: string): string {
  return `/workspace/job-${jobId}`;
}

/** Keep only the tail of a log — that's where the actual error usually is. */
function tail(text: string, maxChars = 6000): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `…(truncated)…\n${trimmed.slice(-maxChars)}`;
}

function shellQuote(command: string): string {
  return `'${command.replace(/'/g, `'\\''`)}'`;
}

function fail(jobId: string, error: string): void {
  updateJob(jobId, { status: 'failed', error });
  logEvent(jobId, 'job_failed', { error });
}

function combinedLog(result: ExecResult): string {
  return tail([result.stderr, result.stdout].filter(Boolean).join('\n'));
}

/* ==========================================================================
 * Pre-flight structural validation of the cloned repo's manifests.
 *
 * Runs inside the detect container AFTER clone and BEFORE stack detection,
 * install, or the AI fix loop. The point is to catch broken/conflicting
 * input data up front and stop with a specific status, rather than letting
 * it crash the parser, fail install cryptically, or — worst of all — get
 * handed to the fix loop, whose read_file/write_file/run_command tools could
 * make unrelated destructive changes trying to "fix" a structural problem.
 *
 * Handled (each stops the pipeline before install, except missing lockfile):
 *   - Malformed package.json (invalid JSON)            -> invalid_manifest
 *   - Malformed pyproject.toml (invalid TOML)          -> invalid_manifest
 *   - requirements.txt vs pyproject.toml disagreeing
 *     on the same package's version                    -> conflicting_manifests
 *   - engines.node incompatible with the Node image    -> engine_version_mismatch
 *   - package.json with no lockfile                    -> NOT fatal; recorded
 *                                                         as stack.noLockfile
 *
 * NOT handled (out of scope for this step):
 *   - Monorepos / multiple package.json files (rejected separately as an
 *     unsupported_variant during stack detection)
 *   - Private package registries requiring auth
 *   - Git submodules
 *   - Malformed requirements.txt beyond simple "name==version" lines
 *   - Lockfile-vs-manifest version drift
 *   - Python version constraints (requires-python) vs the Python image
 * ========================================================================== */

export type RepoValidation =
  | { kind: 'ok' }
  | { kind: 'invalid_manifest'; message: string }
  | { kind: 'conflicting_manifests'; message: string }
  | { kind: 'engine_version_mismatch'; message: string };

/** cat a file inside the container; null when it doesn't exist. */
async function readIfExists(exec: ScopedExec, filePath: string): Promise<string | null> {
  const result = await exec(['cat', filePath]);
  return result.exitCode === 0 ? result.stdout : null;
}

/** node:20 -> "20"; falls back to 20 if the image tag is unexpected. */
function nodeMajorFromImage(image: string): string {
  const match = image.match(/node:(\d+)/);
  return match ? match[1] : '20';
}

/** PyPI treats "_", "-", "." and case as equivalent — normalize before comparing. */
function normalizePkgName(name: string): string {
  return name.trim().toLowerCase().replace(/[_.]+/g, '-');
}

/** First concrete numeric version in a spec (e.g. "^2.0.1" -> "2.0.1"), or null. */
function extractBaseVersion(spec: string): string | null {
  const match = spec.match(/\d+(?:\.\d+)*/);
  return match ? match[0] : null;
}

interface DepSpec {
  raw: string;
  base: string | null;
}

/** Parse simple "name==1.2.3" / "name>=1.0" lines; skips options, URLs, comments. */
function parseRequirements(content: string): Map<string, DepSpec> {
  const deps = new Map<string, DepSpec>();
  for (const line of content.split('\n')) {
    const stripped = line.replace(/#.*$/, '').trim();
    if (!stripped || stripped.startsWith('-') || /^[a-z+]+:\/\//i.test(stripped) || stripped.includes('@')) continue;
    const match = stripped.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/);
    if (!match) continue;
    const spec = match[2].trim();
    deps.set(normalizePkgName(match[1]), { raw: spec || '(any)', base: extractBaseVersion(spec) });
  }
  return deps;
}

/** Pull dependency specs out of a parsed pyproject: Poetry table + PEP 621 array. */
function parsePyprojectDeps(parsed: Record<string, unknown>): Map<string, DepSpec> {
  const deps = new Map<string, DepSpec>();

  const poetryDeps = (parsed?.tool as any)?.poetry?.dependencies;
  if (poetryDeps && typeof poetryDeps === 'object') {
    for (const [name, value] of Object.entries(poetryDeps)) {
      if (normalizePkgName(name) === 'python') continue;
      const raw = typeof value === 'string' ? value : typeof (value as any)?.version === 'string' ? (value as any).version : '';
      deps.set(normalizePkgName(name), { raw: raw || '(any)', base: extractBaseVersion(raw) });
    }
  }

  const projectDeps = (parsed?.project as any)?.dependencies;
  if (Array.isArray(projectDeps)) {
    for (const entry of projectDeps) {
      if (typeof entry !== 'string') continue;
      const match = entry.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/);
      if (!match) continue;
      const spec = match[2].trim();
      deps.set(normalizePkgName(match[1]), { raw: spec || '(any)', base: extractBaseVersion(spec) });
    }
  }

  return deps;
}

/** Same package pinned to different concrete versions across the two manifests. */
function findManifestConflicts(reqContent: string, pyContent: string, pyParsed: Record<string, unknown>): string[] {
  const reqDeps = parseRequirements(reqContent);
  const pyDeps = parsePyprojectDeps(pyParsed);
  const conflicts: string[] = [];
  for (const [name, reqSpec] of reqDeps) {
    const pySpec = pyDeps.get(name);
    if (pySpec && reqSpec.base && pySpec.base && reqSpec.base !== pySpec.base) {
      conflicts.push(`${name} (requirements.txt: ${reqSpec.raw}, pyproject.toml: ${pySpec.raw})`);
    }
  }
  return conflicts;
}

/**
 * See the block comment above for the full handled/not-handled list. Returns
 * 'ok' when nothing structural is wrong; otherwise a specific problem the
 * caller maps to a terminal job status.
 */
export async function validateRepoInputs(exec: ScopedExec): Promise<RepoValidation> {
  const [pkgJson, requirementsTxt, pyprojectToml] = await Promise.all([
    readIfExists(exec, 'package.json'),
    readIfExists(exec, 'requirements.txt'),
    readIfExists(exec, 'pyproject.toml'),
  ]);

  // ---- package.json: must be valid JSON; engines.node must allow our image ----
  if (pkgJson !== null) {
    let pkg: { engines?: { node?: unknown } };
    try {
      pkg = JSON.parse(pkgJson);
    } catch {
      return { kind: 'invalid_manifest', message: 'package.json exists but is not valid JSON.' };
    }

    const enginesNode = pkg.engines?.node;
    if (typeof enginesNode === 'string' && enginesNode.trim()) {
      const range = enginesNode.trim();
      const imageMajor = nodeMajorFromImage(config.images.node);
      try {
        // Does the required range overlap the Node major line the image ships?
        // e.g. ">=22" has no overlap with "20.x" -> mismatch.
        if (semver.validRange(range) && !semver.intersects(range, `${imageMajor}.x`)) {
          return {
            kind: 'engine_version_mismatch',
            message: `package.json requires Node "${range}" (engines.node), but the build image provides Node ${imageMajor}.x.`,
          };
        }
      } catch {
        // Unparseable range — don't block; let install proceed as before.
      }
    }
  }

  // ---- pyproject.toml: must be valid TOML ----
  let pyParsed: Record<string, unknown> | null = null;
  if (pyprojectToml !== null) {
    try {
      pyParsed = parseToml(pyprojectToml) as Record<string, unknown>;
    } catch {
      return { kind: 'invalid_manifest', message: 'pyproject.toml exists but is not valid TOML.' };
    }
  }

  // ---- requirements.txt vs pyproject.toml: no conflicting pinned versions ----
  if (requirementsTxt !== null && pyprojectToml !== null && pyParsed !== null) {
    const conflicts = findManifestConflicts(requirementsTxt, pyprojectToml, pyParsed);
    if (conflicts.length > 0) {
      return {
        kind: 'conflicting_manifests',
        message: `requirements.txt and pyproject.toml specify conflicting versions for: ${conflicts.join('; ')}.`,
      };
    }
  }

  return { kind: 'ok' };
}

/**
 * Builds the fix loop's only window into the container. This is the one
 * place in the codebase where AI tool calls turn into dockerode calls —
 * everything under src/ai only ever sees the ToolExecutors interface.
 * Paths are confined to the job's workdir: absolute paths and `..`
 * traversal are stripped before touching the container.
 */
function makeToolExecutors(container: Docker.Container, workdir: string): ToolExecutors {
  const resolvePath = (relPath: string): string => {
    const normalized = path.posix.normalize(relPath).replace(/^(\.\.\/)+/, '');
    return normalized.replace(/^\/+/, '');
  };

  return {
    readFile: async (relPath) => {
      const safePath = resolvePath(relPath);
      const result = await execInContainer(container, ['cat', safePath], { workdir, timeoutMs: 15_000 });
      if (result.exitCode !== 0) {
        throw new Error(`could not read ${relPath}: ${result.stderr || result.stdout || 'not found'}`);
      }
      return result.stdout;
    },
    writeFile: async (relPath, content) => {
      const safePath = resolvePath(relPath);
      const dir = path.posix.dirname(safePath);
      const mkdirCmd = dir && dir !== '.' ? `mkdir -p '${dir}' && ` : '';
      // Base64-encode so arbitrary AI-authored content (quotes, newlines,
      // shell metacharacters) never has to be escaped into a shell command.
      const b64 = Buffer.from(content, 'utf8').toString('base64');
      const result = await execInContainer(container, ['sh', '-c', `${mkdirCmd}echo '${b64}' | base64 -d > '${safePath}'`], {
        workdir,
        timeoutMs: 15_000,
      });
      if (result.exitCode !== 0) {
        throw new Error(`could not write ${relPath}: ${result.stderr || result.stdout}`);
      }
    },
    runCommand: (command) => execInContainer(container, ['sh', '-c', command], { workdir, timeoutMs: 60_000 }),
  };
}

/** Node always has package.json; Python has one of these two, never both meaningfully. */
async function readManifestContent(stack: StackInfo, tools: ToolExecutors): Promise<string> {
  if (stack.language === 'node') {
    return tools.readFile('package.json').catch(() => '');
  }
  return tools
    .readFile('requirements.txt')
    .catch(() => tools.readFile('pyproject.toml'))
    .catch(() => '');
}

/**
 * Outcome of the whole fix loop.
 * - succeeded: a re-test passed.
 * - unfixable: reflection stopped the loop early because the failure isn't
 *   fixable within this approach (e.g. a missing paid API key). When true,
 *   succeeded is always false.
 */
export interface AttemptFixResult {
  succeeded: boolean;
  unfixable: boolean;
}

/**
 * Up to config.ai.maxFixAttempts rounds of: diagnose the current error,
 * hand that diagnosis + the tool-calling loop a shot at fixing it, re-test
 * by reinstalling and rerunning, then reflect on what happened before
 * deciding whether to retry. Diagnosis is a pre-step, not an attempt in its
 * own right — it doesn't count against the cap.
 *
 * The 5-attempt cap is a hard ceiling. Reflection can only stop the loop
 * EARLY (via shouldRetry: false), never extend it. Each attempt after the
 * first is steered by the previous attempt's reflection, so retries are
 * informed rather than blind.
 */
export async function attemptFix(
  jobId: string,
  container: Docker.Container,
  workdir: string,
  stack: StackInfo,
  initialErrorLog: string
): Promise<AttemptFixResult> {
  const tools = makeToolExecutors(container, workdir);
  let currentError = initialErrorLog;
  let priorReflection: Reflection | null = null;

  for (let attemptNumber = 1; attemptNumber <= config.ai.maxFixAttempts; attemptNumber++) {
    updateJob(jobId, { status: 'fixing' });

    const manifestContent = await readManifestContent(stack, tools);
    const diagnosis = await diagnoseFailure(jobId, container.id, currentError, manifestContent);
    // A low-confidence diagnosis still gets a fix attempt — we just flag it so
    // the report shows a shaky guess as such rather than as a certain call.
    const lowConfidenceDiagnosis = diagnosis.confidence < config.ai.lowConfidenceThreshold;
    const errorBefore = currentError;
    const fixResult = await runFixAttempt(jobId, attemptNumber, currentError, diagnosis, tools, priorReflection);

    // ---- re-test: reinstall, then rerun (unless install itself failed) ----
    updateJob(jobId, { status: 'installing' });
    logEvent(jobId, 'install_started', { attemptNumber, command: stack.installCommand, phase: 'retest' });
    const install = await execInContainer(container, ['sh', '-c', stack.installCommand], {
      workdir,
      timeoutMs: config.installTimeoutMs,
    });

    let succeeded = false;
    let retestCommand = stack.installCommand;
    let outcomeError: string | null = null;

    if (install.timedOut || install.exitCode !== 0) {
      outcomeError = install.timedOut
        ? `Install timed out after ${config.installTimeoutMs / 1000}s (${stack.installCommand})`
        : `Install failed (${stack.installCommand}):\n${combinedLog(install)}`;
      logEvent(jobId, 'install_failed', { attemptNumber, phase: 'retest', error: outcomeError });
    } else {
      logEvent(jobId, 'install_succeeded', { attemptNumber, phase: 'retest', command: stack.installCommand });
      updateJob(jobId, { status: 'running' });
      retestCommand = stack.startCommand!;
      logEvent(jobId, 'run_started', { attemptNumber, command: stack.startCommand, phase: 'retest' });
      const run = await execInContainer(
        container,
        ['sh', '-c', `timeout -k 5 ${config.runTimeoutSec} sh -c ${shellQuote(stack.startCommand!)}`],
        { workdir, timeoutMs: (config.runTimeoutSec + 30) * 1000 }
      );
      if (run.exitCode === 0 || run.exitCode === 124) {
        succeeded = true;
        logEvent(jobId, 'run_succeeded', { attemptNumber, phase: 'retest', exitCode: run.exitCode });
      } else {
        outcomeError = `App crashed (exit ${run.exitCode ?? 'unknown'}) running "${stack.startCommand}":\n${combinedLog(run)}`;
        logEvent(jobId, 'run_failed', { attemptNumber, phase: 'retest', exitCode: run.exitCode, error: outcomeError });
      }
    }

    // ---- reflection step: between "attempt result comes back" and "decide whether to retry" ----
    const reflection = await reflectOnAttempt({
      attemptNumber,
      errorBefore,
      filesChanged: fixResult.filesChanged,
      diff: fixResult.diff,
      explanation: fixResult.explanation,
      retestCommand,
      succeeded,
      outcomeError,
    });

    logEvent(jobId, 'reflection_completed', {
      attemptNumber,
      shouldRetry: reflection.shouldRetry,
      confidence: reflection.confidence,
      attemptFailed: reflection.attemptFailed,
      failureReason: reflection.failureReason,
      nextStrategy: reflection.nextStrategy,
    });

    appendAttempt(jobId, {
      attemptNumber,
      diagnosis,
      lowConfidenceDiagnosis,
      errorBefore,
      filesChanged: fixResult.filesChanged,
      diff: fixResult.diff,
      explanation: fixResult.explanation,
      reflection,
      timestamp: new Date().toISOString(),
    });

    if (succeeded) {
      return { succeeded: true, unfixable: false };
    }

    // Reflection can short-circuit the loop when the failure looks unfixable
    // within this approach — no point burning the remaining attempts.
    if (!reflection.shouldRetry) {
      return { succeeded: false, unfixable: true };
    }

    currentError = outcomeError ?? currentError;
    priorReflection = reflection;
  }

  return { succeeded: false, unfixable: false };
}

/**
 * Full job pipeline. Everything repo-related happens inside Docker
 * containers — the repo is never cloned to the host.
 *
 * Phase 1: shallow clone in a tiny alpine/git container just to read the
 *          repo root and detect the stack (so we know which base image to use).
 * Phase 2: fresh stack container (node:20 / python:3.12): clone, install,
 *          run — with an AI diagnose+fix pass on failure before giving up.
 */
export async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;
  const workdir = jobWorkdir(jobId);

  // ---- Phase 1: clone + detect in a throwaway alpine/git container ----
  updateJob(jobId, { status: 'cloning' });
  let stack: StackInfo | undefined;
  {
    const detectContainer = await createJobContainer({
      image: config.images.detect,
      jobId,
      namePrefix: 'reporevive-detect',
    });
    try {
      const clone = await execInContainer(
        detectContainer,
        ['git', 'clone', '--depth', '1', job.repoUrl, workdir],
        { timeoutMs: config.cloneTimeoutMs }
      );
      if (clone.timedOut || clone.exitCode !== 0) {
        fail(jobId, `git clone failed — is the repo public and the URL correct?\n${combinedLog(clone)}`);
        return;
      }

      updateJob(jobId, { status: 'detecting' });
      const scopedExec: ScopedExec = (cmd) => execInContainer(detectContainer, cmd, { workdir, timeoutMs: 30_000 });

      // Catch broken/conflicting input data before install or the fix loop —
      // these are structural problems the AI tools shouldn't be turned loose on.
      const validation = await validateRepoInputs(scopedExec);
      if (validation.kind !== 'ok') {
        const eventByKind = {
          invalid_manifest: 'manifest_invalid',
          conflicting_manifests: 'manifest_conflict',
          engine_version_mismatch: 'engine_mismatch',
        } as const;
        updateJob(jobId, { status: validation.kind, error: validation.message });
        logEvent(jobId, eventByKind[validation.kind], { status: validation.kind, message: validation.message });
        return;
      }

      const detected = await detectStack(scopedExec);

      if (detected.kind === 'not_found') {
        const message =
          'No package.json, requirements.txt, or pyproject.toml found in the repo root. Only Node and Python projects are supported in this MVP.';
        updateJob(jobId, { status: 'unsupported_stack', error: message });
        logEvent(jobId, 'stack_detection_failed', { reason: 'not_found', message });
        return;
      }
      if (detected.kind === 'unsupported_variant') {
        updateJob(jobId, { status: 'unsupported_stack', error: detected.reason });
        logEvent(jobId, 'stack_detection_failed', { reason: 'unsupported_variant', message: detected.reason });
        return;
      }
      stack = detected.stack;
      logEvent(jobId, 'stack_detected', {
        language: stack.language,
        packageManager: stack.packageManager,
        entryPoint: stack.entryPoint,
        noLockfile: stack.noLockfile,
      });
    } finally {
      await destroyContainer(detectContainer);
    }
  }

  updateJob(jobId, { stack });

  if (!stack.startCommand) {
    fail(
      jobId,
      `Detected a ${stack.language} project but couldn't determine how to start it (no start script and no common entry file like ${
        stack.language === 'node' ? 'index.js/server.js' : 'app.py/main.py'
      }).`
    );
    return;
  }

  // ---- Phase 2: real run in the stack-appropriate container ----
  const image = stack.language === 'node' ? config.images.node : config.images.python;
  const container = await createJobContainer({ image, jobId, namePrefix: 'reporevive-job' });

  try {
    const clone = await execInContainer(
      container,
      ['git', 'clone', '--depth', '1', job.repoUrl, workdir],
      { timeoutMs: config.cloneTimeoutMs }
    );
    if (clone.timedOut || clone.exitCode !== 0) {
      fail(jobId, `git clone failed in the run container:\n${combinedLog(clone)}`);
      return;
    }

    updateJob(jobId, { status: 'installing' });
    logEvent(jobId, 'install_started', { command: stack.installCommand, phase: 'initial' });
    const install = await execInContainer(container, ['sh', '-c', stack.installCommand], {
      workdir,
      timeoutMs: config.installTimeoutMs,
    });

    let fixResult: AttemptFixResult = { succeeded: false, unfixable: false };
    let lastError: string | null = null;

    if (install.timedOut || install.exitCode !== 0) {
      lastError = install.timedOut
        ? `Install timed out after ${config.installTimeoutMs / 1000}s (${stack.installCommand})`
        : `Install failed (${stack.installCommand}):\n${combinedLog(install)}`;
      logEvent(jobId, 'install_failed', { phase: 'initial', error: lastError });
      fixResult = await attemptFix(jobId, container, workdir, stack, lastError);
    } else {
      logEvent(jobId, 'install_succeeded', { phase: 'initial', command: stack.installCommand });
      updateJob(jobId, { status: 'running' });
      logEvent(jobId, 'run_started', { command: stack.startCommand, phase: 'initial' });
      // `timeout <n>` inside the container: exit 124 means the process was
      // still alive when the timer fired (a server that stayed up = success);
      // exit 0 means it finished cleanly and quickly (a script = also success);
      // anything else is a crash.
      const run = await execInContainer(
        container,
        ['sh', '-c', `timeout -k 5 ${config.runTimeoutSec} sh -c ${shellQuote(stack.startCommand)}`],
        { workdir, timeoutMs: (config.runTimeoutSec + 30) * 1000 }
      );
      if (run.exitCode === 0 || run.exitCode === 124) {
        fixResult = { succeeded: true, unfixable: false };
        logEvent(jobId, 'run_succeeded', { phase: 'initial', exitCode: run.exitCode });
      } else {
        lastError = `App crashed (exit ${run.exitCode ?? 'unknown'}) running "${stack.startCommand}":\n${combinedLog(run)}`;
        logEvent(jobId, 'run_failed', { phase: 'initial', exitCode: run.exitCode, error: lastError });
        fixResult = await attemptFix(jobId, container, workdir, stack, lastError);
      }
    }

    if (!fixResult.succeeded) {
      if (fixResult.unfixable) {
        const error = lastError ?? 'The failure was judged unfixable within the current approach.';
        updateJob(jobId, { status: 'failed_unfixable', error });
        logEvent(jobId, 'job_failed_unfixable', { error });
      } else {
        fail(jobId, lastError ?? 'Unknown failure.');
      }
      return;
    }

    // zip is not preinstalled on node:20/python:3.12; apt-get is fast and
    // both images are Debian-based, so this works for either stack.
    const zip = await execInContainer(
      container,
      ['sh', '-c', `apt-get update -qq && apt-get install -y -qq zip >/dev/null 2>&1 && zip -rq ${RESULT_ZIP_PATH_IN_CONTAINER} .`],
      { workdir, timeoutMs: 120_000 }
    );
    if (zip.exitCode !== 0) {
      fail(jobId, `Job ran successfully but packaging the result failed:\n${combinedLog(zip)}`);
      return;
    }

    const zipBuffer = await copyFileFromContainer(container, RESULT_ZIP_PATH_IN_CONTAINER);
    const zipPath = path.join(resultsDir, `${jobId}.zip`);
    fs.writeFileSync(zipPath, zipBuffer);

    updateJob(jobId, { status: 'succeeded', error: null, resultZipPath: zipPath });
    logEvent(jobId, 'job_succeeded', {
      resultZip: path.basename(zipPath),
      attempts: getJob(jobId)?.attempts.length ?? 0,
    });
  } finally {
    await destroyContainer(container);
  }
}
