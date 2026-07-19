import { FixAttempt } from './ai/types';

export type JobStatus =
  | 'queued'
  | 'cloning'
  | 'detecting'
  | 'installing'
  | 'running'
  | 'fixing' // AI diagnose+fix loop in progress
  | 'succeeded'
  | 'failed'
  | 'failed_unfixable' // reflection stopped the loop early: not fixable within this approach
  | 'unsupported_stack'
  // Structural input problems caught before install/fix loop ever runs:
  | 'invalid_manifest' // package.json/pyproject.toml exists but doesn't parse
  | 'conflicting_manifests' // requirements.txt vs pyproject.toml disagree on a package version
  | 'engine_version_mismatch'; // engines.node incompatible with the build image's Node

export type Language = 'node' | 'python';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry';

export interface StackInfo {
  language: Language;
  packageManager: PackageManager;
  installCommand: string;
  /** null when we detected the language but couldn't figure out how to start it */
  startCommand: string | null;
  /** 'scripts.start' or the filename we fell back to */
  entryPoint: string | null;
  /**
   * Node repos only: true when package.json has no lockfile
   * (package-lock.json/yarn.lock/pnpm-lock.yaml). Not fatal — install will
   * generate one — but surfaced in the report as a known condition. Always
   * false for Python.
   */
  noLockfile: boolean;
}

export interface Job {
  id: string;
  userId: string | null;
  repoUrl: string;
  status: JobStatus;
  stack: StackInfo | null;
  attempts: FixAttempt[];
  /** last error log snippet, for polling clients */
  error: string | null;
  createdAt: string;
  resultZipPath: string | null;
  reportPath: string | null;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}
