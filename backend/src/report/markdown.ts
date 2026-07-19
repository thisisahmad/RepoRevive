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
 * Renders the diagnosis with its confidence and assumptions so a shaky guess
 * reads as one — never as a certain call. Guards against pre-feature attempts
 * that predate confidence/assumptions.
 */
function diagnosisLines(attempt: ReportData['attempts'][number]): string[] {
  const { diagnosis } = attempt;
  const categoryLabel = CATEGORY_LABELS[diagnosis.category] ?? diagnosis.category;
  const affected = diagnosis.affectedPackage ? ` (${diagnosis.affectedPackage})` : '';
  const confidence = typeof diagnosis.confidence === 'number' ? diagnosis.confidence : 0;

  const lines: string[] = [];
  const lowConfidence = attempt.lowConfidenceDiagnosis;
  const flag = lowConfidence ? ' ⚠️ low confidence — treat as a tentative guess' : '';
  lines.push(`**Diagnosis:** ${categoryLabel}${affected} (confidence: ${confidence.toFixed(2)})${flag}`);
  lines.push(`**Explanation:** ${diagnosis.explanation}`);

  const assumptions = diagnosis.assumptions ?? [];
  if (assumptions.length > 0) {
    lines.push('', '**Assumptions (not verified from the log):**');
    for (const assumption of assumptions) lines.push(`- ${assumption}`);
  }
  return lines;
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
    if (report.stack.noLockfile) {
      lines.push('**Lockfile:** none found — dependencies were installed without a lockfile (one was generated at install time).');
    }
  }
  lines.push('', report.finalOutcome);

  // Structural input problems caught before install: no attempts to show, but
  // the specific validation message (which package/version, etc.) matters.
  if (
    report.status === 'invalid_manifest' ||
    report.status === 'conflicting_manifests' ||
    report.status === 'engine_version_mismatch'
  ) {
    lines.push('', '## Input validation', '', '```', (report.error ?? 'No details captured.').trim(), '```');
  }

  if (report.attempts.length > 0) {
    lines.push('', '## Fix attempts');
    for (const attempt of report.attempts) {
      lines.push('', `### Attempt ${attempt.attemptNumber}`, '');
      lines.push(...diagnosisLines(attempt));
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
