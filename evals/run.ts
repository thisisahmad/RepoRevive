/**
 * RepoRevive evaluation harness.
 *
 * Runs a fixed set of known public repos (fixtures.json) through the REAL
 * pipeline (backend/src/sandbox/pipeline.ts — reused directly, no duplicated
 * logic) and records how the system actually performed. Success/failure is
 * taken purely from the pipeline's own objective signal (the job's terminal
 * status), NOT from any AI grading itself — the eval stays honest and simple.
 *
 * Output:
 *   - evals/results/eval-<timestamp>.json  (one file per run, kept in the repo)
 *   - evals/report.md                      (regenerated after each run)
 *
 * Run with:  cd backend && npm run eval
 */

import fs from 'fs';
import path from 'path';
import { createJob, getJob } from '../backend/src/jobs/store';
import { processJob } from '../backend/src/sandbox/pipeline';
import type { Job, JobStatus } from '../backend/src/types';

const EVAL_DIR = __dirname;
const RESULTS_DIR = path.join(EVAL_DIR, 'results');
const FIXTURES_PATH = path.join(EVAL_DIR, 'fixtures.json');
const REPORT_PATH = path.join(EVAL_DIR, 'report.md');

// A single fixture shouldn't be able to hang the whole run. processJob can't be
// cancelled once started, so on timeout we record the job's status-so-far and
// move on. Generous by default (real installs are slow); override for quick runs.
const FIXTURE_TIMEOUT_MS = Number(process.env.EVAL_FIXTURE_TIMEOUT_MS ?? 15 * 60_000);

type ExpectedOutcome = 'fixable' | 'unfixable' | 'unsupported' | 'invalid_manifest';

interface Fixture {
  repoUrl: string;
  expectedStack: 'node' | 'python' | 'none';
  expectedOutcome: ExpectedOutcome;
  notes: string;
}

/** Normalized outcome derived purely from the job's terminal status. */
type ActualOutcome =
  | 'fixable'
  | 'unfixable'
  | 'failed'
  | 'unsupported'
  | 'invalid_manifest'
  | 'conflicting_manifests'
  | 'engine_version_mismatch'
  | 'error';

interface FixtureResult {
  repoUrl: string;
  notes: string;
  expectedStack: string;
  expectedOutcome: ExpectedOutcome;
  actualStack: string | null;
  actualStatus: string;
  actualOutcome: ActualOutcome;
  pass: boolean;
  attemptsUsed: number;
  diagnosisCategories: string[];
  /** Manual/eyeballed field — left null by the harness, fill in after reviewing. */
  diagnosisReasonable: boolean | null;
  hadLowConfidenceDiagnosis: boolean;
  /** reflection.shouldRetry per attempt, in order. */
  shouldRetryTrace: boolean[];
  /** True when the loop stopped early on reflection's call (status failed_unfixable). */
  reflectionGaveUpEarly: boolean;
  /** Did reflection's stop/continue behavior line up with the fixture's expectation? */
  reflectionBehavedAsExpected: boolean | null;
  timeMs: number;
  error: string | null;
}

interface Aggregates {
  totalFixtures: number;
  passed: number;
  passRate: number;
  overallFixRate: number;
  fixRateAmongExpectedFixable: number;
  avgAttemptsPerSuccessfulFix: number | null;
  avgTimeMsPerJob: number;
  unfixableStoppedEarlyRate: number | null;
  lowConfidenceCorrelation: {
    withLowConfidenceDiagnosis: number;
    ofThoseSucceeded: number;
    ofThoseNotSucceeded: number;
  };
}

interface EvalRun {
  meta: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    nodeVersion: string;
    fixtureTimeoutMs: number;
    note: string;
  };
  results: FixtureResult[];
  aggregates: Aggregates;
}

function loadFixtures(): Fixture[] {
  const raw = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8')) as { fixtures: Fixture[] };
  return raw.fixtures;
}

/** Objective mapping from the pipeline's own terminal status to a normalized outcome. */
function normalizeOutcome(status: JobStatus | string): ActualOutcome {
  switch (status) {
    case 'succeeded':
      return 'fixable';
    case 'failed_unfixable':
      return 'unfixable';
    case 'failed':
      return 'failed';
    case 'unsupported_stack':
      return 'unsupported';
    case 'invalid_manifest':
      return 'invalid_manifest';
    case 'conflicting_manifests':
      return 'conflicting_manifests';
    case 'engine_version_mismatch':
      return 'engine_version_mismatch';
    default:
      // Non-terminal (e.g. 'cloning') means the pipeline threw before finishing.
      return 'error';
  }
}

/** Did reflection's give-up behavior match what the fixture expected? null when N/A. */
function reflectionExpectation(expected: ExpectedOutcome, outcome: ActualOutcome, gaveUpEarly: boolean): boolean | null {
  if (expected === 'unfixable') return gaveUpEarly; // should have stopped early
  if (expected === 'fixable') return outcome === 'fixable'; // shouldn't have given up
  return null; // unsupported / invalid_manifest never reach the fix loop
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ timedOut: boolean; error: Error | null }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'__timeout__'>((resolve) => {
    timer = setTimeout(() => resolve('__timeout__'), ms);
  });
  try {
    const outcome = await Promise.race([promise.then(() => '__done__' as const), timeout]);
    return { timedOut: outcome === '__timeout__', error: null };
  } catch (err) {
    return { timedOut: false, error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function summarizeJob(job: Job | null): {
  attemptsUsed: number;
  diagnosisCategories: string[];
  hadLowConfidenceDiagnosis: boolean;
  shouldRetryTrace: boolean[];
} {
  const attempts = job?.attempts ?? [];
  return {
    attemptsUsed: attempts.length,
    diagnosisCategories: attempts.map((a) => a.diagnosis?.category ?? 'unknown'),
    hadLowConfidenceDiagnosis: attempts.some((a) => a.lowConfidenceDiagnosis === true),
    shouldRetryTrace: attempts.map((a) => a.reflection?.shouldRetry ?? false),
  };
}

async function runFixture(fixture: Fixture): Promise<FixtureResult> {
  const job = createJob(fixture.repoUrl, null);
  const startedAt = Date.now();

  const { timedOut, error } = await withTimeout(processJob(job.id), FIXTURE_TIMEOUT_MS);
  const timeMs = Date.now() - startedAt;

  const finalJob = getJob(job.id);
  const status = finalJob?.status ?? 'queued';
  const summary = summarizeJob(finalJob);

  let actualOutcome = normalizeOutcome(status);
  let errorMessage = error ? error.message : finalJob?.error ?? null;
  if (timedOut) {
    actualOutcome = 'error';
    errorMessage = `fixture exceeded ${FIXTURE_TIMEOUT_MS}ms; last status "${status}"`;
  } else if (error) {
    actualOutcome = 'error';
  }

  const reflectionGaveUpEarly = status === 'failed_unfixable';

  return {
    repoUrl: fixture.repoUrl,
    notes: fixture.notes,
    expectedStack: fixture.expectedStack,
    expectedOutcome: fixture.expectedOutcome,
    actualStack: finalJob?.stack?.language ?? null,
    actualStatus: status,
    actualOutcome,
    pass: actualOutcome === fixture.expectedOutcome,
    attemptsUsed: summary.attemptsUsed,
    diagnosisCategories: summary.diagnosisCategories,
    diagnosisReasonable: null,
    hadLowConfidenceDiagnosis: summary.hadLowConfidenceDiagnosis,
    shouldRetryTrace: summary.shouldRetryTrace,
    reflectionGaveUpEarly,
    reflectionBehavedAsExpected: reflectionExpectation(fixture.expectedOutcome, actualOutcome, reflectionGaveUpEarly),
    timeMs,
    error: errorMessage,
  };
}

function computeAggregates(results: FixtureResult[]): Aggregates {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const succeeded = results.filter((r) => r.actualOutcome === 'fixable');
  const expectedFixable = results.filter((r) => r.expectedOutcome === 'fixable');
  const expectedUnfixable = results.filter((r) => r.expectedOutcome === 'unfixable');
  const lowConf = results.filter((r) => r.hadLowConfidenceDiagnosis);

  const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    totalFixtures: total,
    passed,
    passRate: total ? passed / total : 0,
    overallFixRate: total ? succeeded.length / total : 0,
    fixRateAmongExpectedFixable: expectedFixable.length
      ? expectedFixable.filter((r) => r.actualOutcome === 'fixable').length / expectedFixable.length
      : 0,
    avgAttemptsPerSuccessfulFix: succeeded.length ? mean(succeeded.map((r) => r.attemptsUsed)) : null,
    avgTimeMsPerJob: mean(results.map((r) => r.timeMs)),
    unfixableStoppedEarlyRate: expectedUnfixable.length
      ? expectedUnfixable.filter((r) => r.reflectionGaveUpEarly).length / expectedUnfixable.length
      : null,
    lowConfidenceCorrelation: {
      withLowConfidenceDiagnosis: lowConf.length,
      ofThoseSucceeded: lowConf.filter((r) => r.actualOutcome === 'fixable').length,
      ofThoseNotSucceeded: lowConf.filter((r) => r.actualOutcome !== 'fixable').length,
    },
  };
}

function repoShortName(repoUrl: string): string {
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  return match ? match[1] : repoUrl;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function renderReport(run: EvalRun): string {
  const { meta, results, aggregates: agg } = run;
  const lines: string[] = [];

  lines.push('# RepoRevive evaluation report', '');
  lines.push(`_Generated from the run at ${meta.startedAt} (regenerated on every run)._`, '');
  lines.push(meta.note, '');

  lines.push('## Results', '');
  lines.push('| Fixture | Expected | Actual | Attempts | Time | Result |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    const expected = `${r.expectedOutcome} (${r.expectedStack})`;
    const actual = `${r.actualOutcome} (${r.actualStatus})`;
    const time = `${(r.timeMs / 1000).toFixed(1)}s`;
    const verdict = r.pass ? 'PASS' : 'FAIL';
    lines.push(`| \`${repoShortName(r.repoUrl)}\` | ${expected} | ${actual} | ${r.attemptsUsed} | ${time} | ${verdict} |`);
  }

  lines.push('', '## Aggregate metrics', '');
  lines.push(`- **Fixtures:** ${agg.totalFixtures}`);
  lines.push(`- **Passed (actual == expected):** ${agg.passed}/${agg.totalFixtures} (${pct(agg.passRate)})`);
  lines.push(`- **Overall fix rate (ended up running):** ${pct(agg.overallFixRate)}`);
  lines.push(`- **Fix rate among repos expected fixable:** ${pct(agg.fixRateAmongExpectedFixable)}`);
  lines.push(
    `- **Avg attempts per successful fix:** ${
      agg.avgAttemptsPerSuccessfulFix === null ? 'n/a (no successes)' : agg.avgAttemptsPerSuccessfulFix.toFixed(2)
    }`
  );
  lines.push(`- **Avg time per job:** ${(agg.avgTimeMsPerJob / 1000).toFixed(1)}s`);
  lines.push(
    `- **Reflection stopped early on expected-unfixable repos:** ${
      agg.unfixableStoppedEarlyRate === null ? 'n/a (none)' : pct(agg.unfixableStoppedEarlyRate)
    }`
  );
  const lc = agg.lowConfidenceCorrelation;
  lines.push(
    `- **Low-confidence diagnoses:** ${lc.withLowConfidenceDiagnosis} job(s) had one — ` +
      `${lc.ofThoseSucceeded} later succeeded, ${lc.ofThoseNotSucceeded} did not.`
  );

  lines.push('', '## Manual review (diagnosis reasonableness)', '');
  lines.push(
    'The `diagnosisReasonable` field in the JSON is intentionally left `null` — it is an eyeballed judgement to fill in after reviewing each job\'s diagnosis categories against its error. Categories observed per fixture:',
    ''
  );
  for (const r of results) {
    const cats = r.diagnosisCategories.length ? r.diagnosisCategories.join(', ') : '(no fix attempts)';
    lines.push(`- \`${repoShortName(r.repoUrl)}\`: ${cats}`);
  }

  lines.push('', '## Notes on each fixture', '');
  for (const r of results) {
    lines.push(`- \`${repoShortName(r.repoUrl)}\` — ${r.notes}`);
    if (r.error) lines.push(`  - error: ${r.error}`);
  }

  lines.push('');
  return lines.join('\n');
}

function timestampSlug(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const fixtures = loadFixtures();

  const startedAtIso = new Date().toISOString();
  const startMs = Date.now();
  console.log(`[eval] running ${fixtures.length} fixtures (timeout ${FIXTURE_TIMEOUT_MS}ms each)`);

  const results: FixtureResult[] = [];
  for (const fixture of fixtures) {
    console.log(`[eval] -> ${fixture.repoUrl}`);
    const result = await runFixture(fixture);
    console.log(`[eval]    ${result.actualOutcome} (status=${result.actualStatus}, ${(result.timeMs / 1000).toFixed(1)}s) ${result.pass ? 'PASS' : 'FAIL'}`);
    results.push(result);
  }

  const finishedAtIso = new Date().toISOString();
  const aggregates = computeAggregates(results);

  const anyRan = results.some((r) => r.actualOutcome !== 'error');
  const note = anyRan
    ? 'This run executed fixtures against a live Docker daemon.'
    : 'NOTE: every fixture ended in "error" — the pipeline could not reach a Docker daemon (and/or no OPENAI_API_KEY was set) in this environment, so no repo was actually built. This is a real, honest run record showing the harness executes end-to-end; re-run on a host with Docker + an OpenAI key for meaningful outcomes.';

  const run: EvalRun = {
    meta: {
      startedAt: startedAtIso,
      finishedAt: finishedAtIso,
      durationMs: Date.now() - startMs,
      nodeVersion: process.version,
      fixtureTimeoutMs: FIXTURE_TIMEOUT_MS,
      note,
    },
    results,
    aggregates,
  };

  const resultsFile = path.join(RESULTS_DIR, `eval-${timestampSlug(startedAtIso)}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(run, null, 2));
  fs.writeFileSync(REPORT_PATH, renderReport(run));

  console.log(`[eval] wrote ${path.relative(process.cwd(), resultsFile)}`);
  console.log(`[eval] wrote ${path.relative(process.cwd(), REPORT_PATH)}`);
  console.log(`[eval] pass rate: ${aggregates.passed}/${aggregates.totalFixtures}`);
}

main().catch((err) => {
  console.error('[eval] harness crashed:', err);
  process.exit(1);
});
