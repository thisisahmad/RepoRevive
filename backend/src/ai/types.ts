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
  /** How sure the model is about this diagnosis given the evidence, 0-1. */
  confidence: number;
  /**
   * Things the model assumed but couldn't verify from the error log alone,
   * e.g. "assumed a Node version mismatch from the error text, did not verify
   * the installed Node version directly". Empty when nothing was assumed.
   */
  assumptions: string[];
  /** Only populated for deprecated_package / major_version_breaking_change. */
  suggestedUpgrade: SuggestedUpgrade | null;
}

/**
 * The model's post-mortem on a single fix attempt, produced after the
 * change was re-tested. Drives whether the loop retries and, if so, with
 * what new direction — stored on the attempt so the report reads as a
 * reasoning trace, not just a pile of diffs.
 */
export interface Reflection {
  attemptFailed: boolean;
  /** Plain English: why the last change didn't fix it, or what it broke. */
  failureReason: string;
  /** Summary of what the previous attempt actually modified. */
  whatChanged: string;
  /** Plain English: what to try differently next, given this failure. */
  nextStrategy: string;
  /** false => stop early; the issue looks unfixable within this approach. */
  shouldRetry: boolean;
  /** 0-1: how confident the model is that nextStrategy will work. */
  confidence: number;
}

/** Everything reflectOnAttempt needs to reason about one finished attempt. */
export interface ReflectionInput {
  attemptNumber: number;
  /** The error that existed before this attempt ran. */
  errorBefore: string;
  filesChanged: string[];
  diff: string;
  /** The fixer's own summary of what it changed. */
  explanation: string;
  /** The command run to re-test the change (install or start command). */
  retestCommand: string;
  /** Whether the re-test passed. */
  succeeded: boolean;
  /** The new error/outcome after the change, or null when it succeeded. */
  outcomeError: string | null;
}

export interface FixAttempt {
  attemptNumber: number;
  diagnosis: DiagnosisResult;
  /**
   * True when the diagnosis confidence was below the trust threshold. The fix
   * loop still runs on a low-confidence diagnosis, but the report surfaces this
   * so a shaky guess isn't presented as a certain diagnosis.
   */
  lowConfidenceDiagnosis: boolean;
  errorBefore: string;
  filesChanged: string[];
  diff: string;
  explanation: string;
  reflection: Reflection;
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
