import { config } from '../config';
import { getJob, updateJob } from '../jobs/store';
import { detectStack } from '../stack/detect';
import { createJobContainer, destroyContainer, execInContainer, ExecResult } from './docker';

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
 * Full job pipeline. Everything repo-related happens inside Docker
 * containers — the repo is never cloned to the host.
 *
 * Phase 1: shallow clone in a tiny alpine/git container just to read the
 *          repo root and detect the stack (so we know which base image to use).
 * Phase 2: fresh stack container (node:20 / python:3.12): clone, install, run.
 */
export async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;
  const workdir = jobWorkdir(jobId);

  // ---- Phase 1: clone + detect in a throwaway alpine/git container ----
  updateJob(jobId, { status: 'cloning' });
  let stack;
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
      stack = await detectStack((cmd) => execInContainer(detectContainer, cmd, { workdir, timeoutMs: 30_000 }));
    } finally {
      await destroyContainer(detectContainer);
    }
  }

  if (!stack) {
    updateJob(jobId, {
      status: 'unsupported_stack',
      error:
        'No package.json, requirements.txt, or pyproject.toml found in the repo root. Only Node and Python projects are supported in this MVP.',
    });
    return;
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
  // Feature 4 will set this to true when handing the container to the AI fix
  // loop instead of destroying it here.
  const keepAliveForFixLoop = false;

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
    if (install.timedOut || install.exitCode !== 0) {
      // TODO(feature 4): enter the AI fix loop here instead of failing,
      // with keepAliveForFixLoop = true so the container survives this fn.
      fail(
        jobId,
        install.timedOut
          ? `Install timed out after ${config.installTimeoutMs / 1000}s (${stack.installCommand})`
          : `Install failed (${stack.installCommand}):\n${combinedLog(install)}`
      );
      return;
    }

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
      updateJob(jobId, { status: 'succeeded', error: null });
      // TODO(feature 6): zip the workspace and copy it out before destroy.
    } else {
      // TODO(feature 4): enter the AI fix loop here instead of failing.
      fail(
        jobId,
        `App crashed (exit ${run.exitCode ?? 'unknown'}) running "${stack.startCommand}":\n${combinedLog(run)}`
      );
    }
  } finally {
    if (!keepAliveForFixLoop) {
      await destroyContainer(container);
    }
  }
}
