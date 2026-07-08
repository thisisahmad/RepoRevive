import { SuggestedUpgrade } from '../ai/types';
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

      lines.push('', `**What changed:** ${attempt.explanation}`);
      if (attempt.filesChanged.length > 0) {
        lines.push('', `Files changed: ${attempt.filesChanged.join(', ')}`);
      }
      if (attempt.diff) {
        lines.push('', '```diff', attempt.diff.trim(), '```');
      }
    }
  }

  if (report.status === 'failed') {
    const lastError = report.attempts.at(-1)?.errorBefore.trim();
    lines.push('', '## Final error', '', '```', lastError || 'No error captured.', '```');
  }

  return lines.join('\n');
}
