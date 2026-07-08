import { ExecResult } from '../sandbox/docker';
import { StackInfo } from '../types';

/** Command runner already scoped to the cloned repo root inside the container. */
export type ScopedExec = (cmd: string[]) => Promise<ExecResult>;

const NODE_ENTRY_CANDIDATES = ['index.js', 'server.js', 'app.js', 'main.js'];
const PYTHON_ENTRY_CANDIDATES = ['app.py', 'main.py', 'server.py'];

/**
 * Inspects the repo root (inside the container) and figures out language,
 * package manager, install command, and start command.
 * Returns null when the stack is neither Node nor Python.
 */
export async function detectStack(exec: ScopedExec): Promise<StackInfo | null> {
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
  return null;
}

async function detectNode(exec: ScopedExec, files: Set<string>): Promise<StackInfo> {
  let pkg: { scripts?: Record<string, string>; main?: string } = {};
  try {
    pkg = JSON.parse((await exec(['cat', 'package.json'])).stdout);
  } catch {
    // malformed package.json — keep going with filename fallbacks
  }

  const packageManager = files.has('pnpm-lock.yaml') ? 'pnpm' : files.has('yarn.lock') ? 'yarn' : 'npm';
  const installCommand =
    packageManager === 'pnpm'
      ? 'corepack enable pnpm && pnpm install'
      : packageManager === 'yarn'
        ? 'yarn install --non-interactive'
        : 'npm install --no-audit --no-fund';

  let startCommand: string | null = null;
  let entryPoint: string | null = null;

  if (pkg.scripts?.start) {
    startCommand = `${packageManager} start`;
    entryPoint = 'scripts.start';
  } else {
    for (const candidate of NODE_ENTRY_CANDIDATES) {
      if (files.has(candidate)) {
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

  return { language: 'node', packageManager, installCommand, startCommand, entryPoint };
}

async function detectPython(exec: ScopedExec, files: Set<string>): Promise<StackInfo> {
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
        : 'pip install .';

  let startCommand: string | null = null;
  let entryPoint: string | null = null;
  for (const candidate of PYTHON_ENTRY_CANDIDATES) {
    if (files.has(candidate)) {
      startCommand = packageManager === 'poetry' ? `poetry run python ${candidate}` : `python ${candidate}`;
      entryPoint = candidate;
      break;
    }
  }

  return { language: 'python', packageManager, installCommand, startCommand, entryPoint };
}
