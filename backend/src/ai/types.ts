export type DiagnosisCategory =
  | 'deprecated_package'
  | 'major_version_breaking_change'
  | 'native_build_failure'
  | 'missing_env_var'
  | 'version_mismatch'
  | 'unknown';

export interface SuggestedUpgrade {
  fromPackage: string;
  fromVersion: string;
  toPackage: string;
  toVersion: string;
  reason: string;
}

export interface DiagnosisResult {
  category: DiagnosisCategory;
  explanation: string;
  affectedPackage: string | null;
  suggestedFix: string;
  /** Only populated for deprecated_package / major_version_breaking_change. */
  suggestedUpgrade: SuggestedUpgrade | null;
}

export interface FixAttempt {
  attemptNumber: number;
  diagnosis: DiagnosisResult;
  errorBefore: string;
  filesChanged: string[];
  diff: string;
  explanation: string;
  timestamp: string;
}

export interface ToolCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Container access the fix loop is allowed, scoped to the job's workspace.
 * pipeline.ts is the only module that implements this against a real
 * container — everything in src/ai only ever sees this interface, never
 * dockerode itself.
 */
export interface ToolExecutors {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  runCommand: (command: string) => Promise<ToolCommandResult>;
}

export interface FixLoopResult {
  filesChanged: string[];
  diff: string;
  explanation: string;
}
