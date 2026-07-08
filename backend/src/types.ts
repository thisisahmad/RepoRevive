export type JobStatus =
  | 'queued'
  | 'cloning'
  | 'detecting'
  | 'installing'
  | 'running'
  | 'fixing' // AI fix loop in progress (feature 4)
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

export interface Attempt {
  attemptNumber: number;
  errorBefore: string;
  filesChanged: string[];
  diff: string;
  explanation: string;
  timestamp: string;
}

export interface Job {
  id: string;
  userId: string | null;
  repoUrl: string;
  status: JobStatus;
  stack: StackInfo | null;
  attempts: Attempt[];
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
