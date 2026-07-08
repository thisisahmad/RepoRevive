import fs from 'fs';
import path from 'path';
import Docker from 'dockerode';
import { config, resultsDir } from '../config';
import { diagnoseFailure } from '../ai/diagnose';
import { runFixAttempt } from '../ai/fixLoop';
import { ToolExecutors } from '../ai/types';
import { appendAttempt, getJob, updateJob } from '../jobs/store';
import { detectStack } from '../stack/detect';
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
}

function combinedLog(result: ExecResult): string {
  return tail([result.stderr, result.stdout].filter(Boolean).join('\n'));
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
 * Up to config.ai.maxFixAttempts rounds of: diagnose the current error,
 * hand that diagnosis + the tool-calling loop a shot at fixing it, then
 * re-test by reinstalling and rerunning. Returns true the moment a retest
 * succeeds; false once attempts are exhausted. Diagnosis is a pre-step, not
 * an attempt in its own right — it doesn't count against the cap.
 */
export async function attemptFix(
  jobId: string,
  container: Docker.Container,
  workdir: string,
  stack: StackInfo,
  initialErrorLog: string
): Promise<boolean> {
  const tools = makeToolExecutors(container, workdir);
  let currentError = initialErrorLog;

  for (let attemptNumber = 1; attemptNumber <= config.ai.maxFixAttempts; attemptNumber++) {
    updateJob(jobId, { status: 'fixing' });

    const manifestContent = await readManifestContent(stack, tools);
    const diagnosis = await diagnoseFailure(jobId, container.id, currentError, manifestContent);
    const fixResult = await runFixAttempt(currentError, diagnosis, tools);

    appendAttempt(jobId, {
      attemptNumber,
      diagnosis,
      errorBefore: currentError,
      filesChanged: fixResult.filesChanged,
      diff: fixResult.diff,
      explanation: fixResult.explanation,
      timestamp: new Date().toISOString(),
    });

    updateJob(jobId, { status: 'installing' });
    const install = await execInContainer(container, ['sh', '-c', stack.installCommand], {
      workdir,
      timeoutMs: config.installTimeoutMs,
    });
    if (install.timedOut || install.exitCode !== 0) {
      currentError = install.timedOut
        ? `Install timed out after ${config.installTimeoutMs / 1000}s (${stack.installCommand})`
        : `Install failed (${stack.installCommand}):\n${combinedLog(install)}`;
      continue;
    }

    updateJob(jobId, { status: 'running' });
    const run = await execInContainer(
      container,
      ['sh', '-c', `timeout -k 5 ${config.runTimeoutSec} sh -c ${shellQuote(stack.startCommand!)}`],
      { workdir, timeoutMs: (config.runTimeoutSec + 30) * 1000 }
    );
    if (run.exitCode === 0 || run.exitCode === 124) {
      return true;
    }
    currentError = `App crashed (exit ${run.exitCode ?? 'unknown'}) running "${stack.startCommand}":\n${combinedLog(run)}`;
  }

  return false;
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
      const detected = await detectStack((cmd) => execInContainer(detectContainer, cmd, { workdir, timeoutMs: 30_000 }));

      if (detected.kind === 'not_found') {
        updateJob(jobId, {
          status: 'unsupported_stack',
          error:
            'No package.json, requirements.txt, or pyproject.toml found in the repo root. Only Node and Python projects are supported in this MVP.',
        });
        return;
      }
      if (detected.kind === 'unsupported_variant') {
        updateJob(jobId, { status: 'unsupported_stack', error: detected.reason });
        return;
      }
      stack = detected.stack;
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
    const install = await execInContainer(container, ['sh', '-c', stack.installCommand], {
      workdir,
      timeoutMs: config.installTimeoutMs,
    });

    let succeeded: boolean;
    let lastError: string | null = null;

    if (install.timedOut || install.exitCode !== 0) {
      lastError = install.timedOut
        ? `Install timed out after ${config.installTimeoutMs / 1000}s (${stack.installCommand})`
        : `Install failed (${stack.installCommand}):\n${combinedLog(install)}`;
      succeeded = await attemptFix(jobId, container, workdir, stack, lastError);
    } else {
      updateJob(jobId, { status: 'running' });
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
        succeeded = true;
      } else {
        lastError = `App crashed (exit ${run.exitCode ?? 'unknown'}) running "${stack.startCommand}":\n${combinedLog(run)}`;
        succeeded = await attemptFix(jobId, container, workdir, stack, lastError);
      }
    }

    if (!succeeded) {
      fail(jobId, lastError ?? 'Unknown failure.');
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
  } finally {
    await destroyContainer(container);
  }
}
