import { ExecResult } from '../sandbox/docker';
import { StackInfo } from '../types';

/** Command runner already scoped to the cloned repo root inside the container. */
export type ScopedExec = (cmd: string[]) => Promise<ExecResult>;

export type DetectResult =
  | { kind: 'supported'; stack: StackInfo }
  // A real, recognizable stack that this MVP deliberately doesn't support
  // (Pipenv, monorepos, ...) — worth a specific message instead of the
  // generic "no manifest found" one.
  | { kind: 'unsupported_variant'; reason: string }
  | { kind: 'not_found' };

const NODE_ENTRY_CANDIDATES = ['index.js', 'server.js', 'app.js', 'src/index.js', 'main.js'];
const PYTHON_ENTRY_CANDIDATES = ['app.py', 'main.py', 'manage.py', 'wsgi.py', 'server.py'];

async function fileExists(exec: ScopedExec, path: string): Promise<boolean> {
  return (await exec(['test', '-f', path])).exitCode === 0;
}

/**
 * Inspects the repo root (inside the container) and figures out language,
 * package manager, install command, and start command.
 */
export async function detectStack(exec: ScopedExec): Promise<DetectResult> {
  const ls = await exec(['ls', '-1a', '.']);
  const files = new Set(
    ls.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );

  if (files.has('package.json')) {
    return detectNode(exec, files);
  }
  if (files.has('requirements.txt') || files.has('pyproject.toml')) {
    return detectPython(exec, files);
  }
  if (files.has('Pipfile')) {
    return {
      kind: 'unsupported_variant',
      reason:
        'This repo uses Pipenv (Pipfile) for dependency management, which this MVP does not support. ' +
        'Only pip (requirements.txt) and Poetry/PEP 621 (pyproject.toml) are supported for Python.',
    };
  }

  return { kind: 'not_found' };
}

async function detectNode(exec: ScopedExec, files: Set<string>): Promise<DetectResult> {
  let pkg: { scripts?: Record<string, string>; main?: string; workspaces?: unknown; packageManager?: string } = {};
  try {
    pkg = JSON.parse((await exec(['cat', 'package.json'])).stdout);
  } catch {
    // malformed package.json — keep going with filename fallbacks
  }

  const isMonorepo =
    files.has('pnpm-workspace.yaml') || files.has('lerna.json') || files.has('nx.json') || Boolean(pkg.workspaces);
  if (isMonorepo) {
    return {
      kind: 'unsupported_variant',
      reason:
        'This looks like a monorepo (npm/yarn/pnpm workspaces, Lerna, or Nx detected). Full monorepo support ' +
        'is out of scope for this MVP — only single-package Node repos are supported.',
    };
  }

  const packageManager = files.has('pnpm-lock.yaml') ? 'pnpm' : files.has('yarn.lock') ? 'yarn' : 'npm';
  const installCommand =
    packageManager === 'pnpm'
      ? pnpmInstallCommand(pkg.packageManager)
      : packageManager === 'yarn'
        ? 'yarn install --non-interactive'
        : 'npm install --no-audit --no-fund';

  let startCommand: string | null = null;
  let entryPoint: string | null = null;

  if (pkg.scripts?.start) {
    startCommand = `${packageManager} start`;
    entryPoint = 'scripts.start';
  } else if (pkg.scripts?.dev) {
    // "dev" isn't a package-manager built-in like "start" is, so npm needs
    // the explicit "run" — using it uniformly works for yarn/pnpm too.
    startCommand = `${packageManager} run dev`;
    entryPoint = 'scripts.dev';
  } else {
    for (const candidate of NODE_ENTRY_CANDIDATES) {
      if (await fileExists(exec, candidate)) {
        startCommand = `node ${candidate}`;
        entryPoint = candidate;
        break;
      }
    }
    if (!startCommand && typeof pkg.main === 'string' && pkg.main.trim()) {
      startCommand = `node ${pkg.main.trim()}`;
      entryPoint = pkg.main.trim();
    }
  }

  return {
    kind: 'supported',
    stack: { language: 'node', packageManager, installCommand, startCommand, entryPoint },
  };
}

/**
 * corepack respects a repo's own "packageManager" pin automatically. Without
 * one, it defaults to the latest known pnpm release, which can require a
 * newer Node than our node:20 image ships (verified: pnpm 11 needs Node
 * >=22.13 and fails outright on 20) — so pin a Node-20-compatible major
 * version ourselves only when the repo hasn't pinned one.
 */
function pnpmInstallCommand(pinnedPackageManager: string | undefined): string {
  const hasOwnPin = typeof pinnedPackageManager === 'string' && pinnedPackageManager.startsWith('pnpm@');
  const activate = hasOwnPin ? 'corepack enable pnpm' : 'corepack enable pnpm && corepack prepare pnpm@9 --activate';
  // COREPACK_ENABLE_DOWNLOAD_PROMPT avoids an interactive "ok to download
  // pnpm?" prompt that would otherwise hang forever — our exec has no stdin.
  return `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && ${activate} && pnpm install --no-frozen-lockfile`;
}

async function detectPython(exec: ScopedExec, files: Set<string>): Promise<DetectResult> {
  let packageManager: 'pip' | 'poetry' = 'pip';
  if (files.has('pyproject.toml')) {
    const pyproject = (await exec(['cat', 'pyproject.toml'])).stdout;
    if (pyproject.includes('[tool.poetry]')) {
      packageManager = 'poetry';
    }
  }

  const installCommand =
    packageManager === 'poetry'
      ? 'pip install poetry && poetry install --no-interaction --no-ansi'
      : files.has('requirements.txt')
        ? 'pip install -r requirements.txt'
        // Any other pyproject.toml (PEP 621, Hatch, PDM, Flit, ...) — pip's
        // PEP 517 build isolation handles the declared backend generically.
        : 'pip install .';

  let startCommand: string | null = null;
  let entryPoint: string | null = null;
  for (const candidate of PYTHON_ENTRY_CANDIDATES) {
    if (await fileExists(exec, candidate)) {
      startCommand = pythonStartCommand(candidate, packageManager);
      entryPoint = candidate;
      break;
    }
  }

  return {
    kind: 'supported',
    stack: { language: 'python', packageManager, installCommand, startCommand, entryPoint },
  };
}

function pythonStartCommand(entry: string, packageManager: 'pip' | 'poetry'): string {
  const runner = packageManager === 'poetry' ? 'poetry run python' : 'python';
  if (entry === 'manage.py') {
    // Bare "manage.py" just prints Django's usage — needs a subcommand.
    // --noreload avoids the dev server's double-process reloader, which
    // behaves oddly under `timeout -k` in a container.
    return `${runner} manage.py runserver 0.0.0.0:8000 --noreload`;
  }
  return `${runner} ${entry}`;
}
