import { Reflection, SuggestedUpgrade } from '../ai/types';
import { ReportData } from './build';

const CATEGORY_LABELS: Record<string, string> = {
  deprecated_package: 'Deprecated package',
  major_version_breaking_change: 'Major version breaking change',
  native_build_failure: 'Native build failure',
  missing_env_var: 'Missing environment variable',
  version_mismatch: 'Runtime version mismatch',
  unknown: 'Unknown',
};

function upgradeLine(u: SuggestedUpgrade): string {
  return `**Suggested upgrade:** ${u.fromPackage}@${u.fromVersion} → ${u.toPackage}@${u.toVersion} — ${u.reason}`;
}

/**
 * Renders the reflection as a reasoning trace: why the attempt failed and
 * what the loop decided to do differently next — the "why", not just the diff.
 */
function reflectionLines(reflection: Reflection): string[] {
  const lines: string[] = ['', '**Reflection**', ''];
  lines.push(`- **Outcome:** ${reflection.attemptFailed ? "Didn't fix the failure" : 'Fixed the failure'}`);
  lines.push(`- **Why:** ${reflection.failureReason}`);
  lines.push(`- **What it changed:** ${reflection.whatChanged}`);
  lines.push(`- **Next strategy:** ${reflection.nextStrategy}`);

  const confidencePct = `${Math.round(reflection.confidence * 100)}% confidence`;
  const decision = reflection.attemptFailed
    ? reflection.shouldRetry
      ? `Retry with the strategy above (${confidencePct}).`
      : 'Stop early — the failure was judged unfixable within the current approach, so remaining attempts were skipped.'
    : 'No further attempts needed.';
  lines.push(`- **Decision:** ${decision}`);

  return lines;
}

export function renderReportMarkdown(report: ReportData): string {
  const lines: string[] = [];

  lines.push('# RepoRevive report', '');
  lines.push(`**Repo:** ${report.repoUrl}`);
  lines.push(`**Status:** ${report.status}`);
  if (report.stack) {
    lines.push(`**Stack:** ${report.stack.language} (${report.stack.packageManager})`);
  }
  lines.push('', report.finalOutcome);

  if (report.attempts.length > 0) {
    lines.push('', '## Fix attempts');
    for (const attempt of report.attempts) {
      const categoryLabel = CATEGORY_LABELS[attempt.diagnosis.category] ?? attempt.diagnosis.category;
      const affected = attempt.diagnosis.affectedPackage ? ` (${attempt.diagnosis.affectedPackage})` : '';

      lines.push('', `### Attempt ${attempt.attemptNumber}`, '');
      lines.push(`**Diagnosis:** ${categoryLabel}${affected}`);
      lines.push(`**Explanation:** ${attempt.diagnosis.explanation}`);
      if (attempt.diagnosis.suggestedUpgrade) {
        lines.push(upgradeLine(attempt.diagnosis.suggestedUpgrade));
      }

      lines.push('', `**What was tried:** ${attempt.explanation}`);
      if (attempt.filesChanged.length > 0) {
        lines.push('', `Files changed: ${attempt.filesChanged.join(', ')}`);
      }
      if (attempt.diff) {
        lines.push('', '```diff', attempt.diff.trim(), '```');
      }

      // reflection is absent on jobs recorded before this feature existed.
      if (attempt.reflection) {
        lines.push(...reflectionLines(attempt.reflection));
      }
    }
  }

  if (report.status === 'failed' || report.status === 'failed_unfixable') {
    const lastError = report.attempts.at(-1)?.errorBefore.trim();
    lines.push('', '## Final error', '', '```', lastError || 'No error captured.', '```');
  }

  return lines.join('\n');
}
