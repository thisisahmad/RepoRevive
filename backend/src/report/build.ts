import { Job, JobStatus } from '../types';

export interface ReportData {
  status: JobStatus;
  repoUrl: string;
  stack: Job['stack'];
  attempts: Job['attempts'];
  finalOutcome: string;
}

export function buildReport(job: Job): ReportData {
  return {
    status: job.status,
    repoUrl: job.repoUrl,
    stack: job.stack,
    attempts: job.attempts,
    finalOutcome: describeOutcome(job.status, job.attempts.length),
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
    case 'unsupported_stack':
      return "This repo's stack isn't supported by this MVP.";
    default:
      return 'This job has not finished yet.';
  }
}
