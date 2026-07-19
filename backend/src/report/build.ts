import { Job, JobStatus } from '../types';

export interface ReportData {
  status: JobStatus;
  repoUrl: string;
  stack: Job['stack'];
  attempts: Job['attempts'];
  finalOutcome: string;
  /** Terminal error/validation message, when the job ended in a failure state. */
  error: string | null;
}

export function buildReport(job: Job): ReportData {
  return {
    status: job.status,
    repoUrl: job.repoUrl,
    stack: job.stack,
    attempts: job.attempts,
    finalOutcome: describeOutcome(job.status, job.attempts.length),
    error: job.error,
  };
}

function describeOutcome(status: JobStatus, attemptCount: number): string {
  const plural = attemptCount === 1 ? 'attempt' : 'attempts';
  switch (status) {
    case 'succeeded':
      return attemptCount > 0
        ? `The repo failed initially but was fixed after ${attemptCount} ${plural} and now runs successfully.`
        : 'The repo ran successfully on the first try.';
    case 'failed':
      return attemptCount > 0
        ? `The repo could not be fixed after ${attemptCount} ${plural}.`
        : 'The repo failed to install or run.';
    case 'failed_unfixable':
      return `The fix loop stopped early after ${attemptCount} ${plural}: reflection concluded the failure isn't fixable within the current approach (for example a missing paid API key or an environment-specific issue), so the remaining attempts were skipped.`;
    case 'cancelled':
      return attemptCount > 0
        ? `The job was cancelled by the user after ${attemptCount} ${plural}.`
        : 'The job was cancelled by the user before it finished.';
    case 'unsupported_stack':
      return "This repo's stack isn't supported by this MVP.";
    case 'invalid_manifest':
      return 'A manifest file is malformed, so the pipeline stopped before installing anything — this is a structural problem the AI fix loop deliberately does not touch.';
    case 'conflicting_manifests':
      return 'requirements.txt and pyproject.toml disagree on a package version. The pipeline stopped rather than silently picking one, so no install was attempted.';
    case 'engine_version_mismatch':
      return "The project's required Node version is incompatible with the build image, caught before install so it doesn't fail cryptically.";
    default:
      return 'This job has not finished yet.';
  }
}
