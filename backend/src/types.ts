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
  | 'unsupported_stack';

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
