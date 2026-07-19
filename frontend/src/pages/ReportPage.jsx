import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { downloadReportMarkdown, getJobReport } from '../lib/api'
import { STATUS_META } from '../lib/jobStatus'
import Logo from '../components/ui/Logo'

const CATEGORY_LABELS = {
  deprecated_package: 'Deprecated package',
  major_version_breaking_change: 'Major version breaking change',
  native_build_failure: 'Native build failure',
  missing_env_var: 'Missing environment variable',
  version_mismatch: 'Runtime version mismatch',
  unknown: 'Unknown',
}

const STRUCTURAL_STATUSES = new Set(['invalid_manifest', 'conflicting_manifests', 'engine_version_mismatch'])
const FAILURE_STATUSES = new Set(['failed', 'failed_unfixable'])

function repoNameFromUrl(repoUrl = '') {
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/)
  return match ? match[1] : 'repo'
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'text-muted', dot: 'bg-muted-dark' }
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 font-mono text-xs ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface/50 p-6">
      <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-dark">{title}</h2>
      {children}
    </section>
  )
}

function StackSummary({ stack }) {
  if (!stack) return null
  const rows = [
    ['Language', stack.language],
    ['Package manager', stack.packageManager],
    ['Install', stack.installCommand],
    ['Start', stack.startCommand ?? '—'],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border-subtle/40 pb-1.5">
          <dt className="font-mono text-xs text-muted-dark">{k}</dt>
          <dd className="text-right font-mono text-xs text-foreground">{v}</dd>
        </div>
      ))}
      {stack.noLockfile && (
        <p className="sm:col-span-2 font-mono text-xs text-yellow-500">
          No lockfile found — dependencies were installed fresh (a lockfile was generated at install time).
        </p>
      )}
    </dl>
  )
}

function DiffBlock({ diff }) {
  if (!diff) return null
  const lines = diff.split('\n')
  return (
    <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
      {lines.map((line, i) => {
        let cls = 'text-muted'
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-accent'
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-error'
        else if (line.startsWith('@@')) cls = 'text-sky-300'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

function DiagnosisBlock({ attempt }) {
  const d = attempt.diagnosis
  if (!d) return null
  const label = CATEGORY_LABELS[d.category] ?? d.category
  const affected = d.affectedPackage ? ` (${d.affectedPackage})` : ''
  const confidence = typeof d.confidence === 'number' ? d.confidence : 0
  const assumptions = d.assumptions ?? []

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-foreground">
          Diagnosis: <span className="font-semibold">{label}</span>
          {affected}
        </span>
        <span className="rounded bg-background/70 px-2 py-0.5 font-mono text-[11px] text-muted">
          confidence {confidence.toFixed(2)}
        </span>
        {attempt.lowConfidenceDiagnosis && (
          <span className="rounded bg-yellow-500/10 px-2 py-0.5 font-mono text-[11px] text-yellow-500">
            low confidence — tentative guess
          </span>
        )}
      </div>
      {d.explanation && <p className="font-mono text-xs leading-relaxed text-muted">{d.explanation}</p>}
      {d.suggestedUpgrade && (
        <p className="font-mono text-xs text-muted">
          Suggested upgrade: {d.suggestedUpgrade.fromPackage}@{d.suggestedUpgrade.fromVersion} →{' '}
          {d.suggestedUpgrade.toPackage}@{d.suggestedUpgrade.toVersion} — {d.suggestedUpgrade.reason}
        </p>
      )}
      {assumptions.length > 0 && (
        <div className="font-mono text-xs text-muted-dark">
          <span className="text-muted">Assumptions (not verified):</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ReflectionBlock({ reflection }) {
  if (!reflection) return null
  const confidencePct = `${Math.round((reflection.confidence ?? 0) * 100)}%`
  const decision = reflection.attemptFailed
    ? reflection.shouldRetry
      ? `Retry with the strategy above (${confidencePct} confidence).`
      : 'Stop early — judged unfixable within the current approach, so remaining attempts were skipped.'
    : 'No further attempts needed.'

  return (
    <div className="mt-4 rounded-lg border border-sky-400/20 bg-sky-400/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-sky-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-sky-300">
          AI reflection
        </span>
        <span className="font-mono text-[11px] text-muted-dark">
          {reflection.attemptFailed ? "Didn't fix the failure" : 'Fixed the failure'}
        </span>
      </div>
      <dl className="space-y-1.5 font-mono text-xs text-muted">
        <div>
          <dt className="inline text-muted-dark">Why: </dt>
          <dd className="inline text-foreground/90">{reflection.failureReason}</dd>
        </div>
        <div>
          <dt className="inline text-muted-dark">What it changed: </dt>
          <dd className="inline text-foreground/90">{reflection.whatChanged}</dd>
        </div>
        <div>
          <dt className="inline text-muted-dark">Next strategy: </dt>
          <dd className="inline text-foreground/90">{reflection.nextStrategy}</dd>
        </div>
        <div>
          <dt className="inline text-muted-dark">Decision: </dt>
          <dd className="inline text-foreground/90">{decision}</dd>
        </div>
      </dl>
    </div>
  )
}

function AttemptCard({ attempt }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/50 p-6">
      <h3 className="mb-3 font-display text-base font-semibold text-foreground">Attempt {attempt.attemptNumber}</h3>
      <DiagnosisBlock attempt={attempt} />

      <div className="mt-4 space-y-2">
        {attempt.explanation && (
          <p className="font-mono text-xs leading-relaxed text-muted">
            <span className="text-muted-dark">What was tried: </span>
            {attempt.explanation}
          </p>
        )}
        {attempt.filesChanged?.length > 0 && (
          <p className="font-mono text-xs text-muted">
            <span className="text-muted-dark">Files changed: </span>
            {attempt.filesChanged.join(', ')}
          </p>
        )}
        <DiffBlock diff={attempt.diff} />
      </div>

      <ReflectionBlock reflection={attempt.reflection} />
    </div>
  )
}

export default function ReportPage() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getJobReport(id)
      .then((data) => {
        if (!cancelled) setReport(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const handleDownload = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const blob = await downloadReportMarkdown(id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reporevive-report-${repoNameFromUrl(report?.repoUrl)}.md`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      // surfaced via the page error area is overkill for a download; ignore
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 bg-mesh-gradient opacity-30" />

      <header className="border-b border-border-subtle/50 bg-background/70 backdrop-blur-xl">
        <div className="section-container-wide flex h-16 items-center justify-between">
          <Logo />
          <Link
            to="/dashboard"
            className="rounded-full border border-border-subtle px-4 py-2 font-mono text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="section-container relative py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center gap-3 py-24 font-mono text-sm text-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-dark/40 border-t-accent" />
              Loading report…
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-2xl border border-error/30 bg-error/5 p-8 text-center">
              <p className="font-mono text-sm text-error">Couldn't load this report</p>
              <p className="mt-2 font-mono text-xs text-muted">{error}</p>
              <Link to="/dashboard" className="mt-4 inline-block font-mono text-xs text-accent hover:underline">
                ← Back to dashboard
              </Link>
            </div>
          )}

          {!isLoading && !error && report && (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="font-mono text-xs uppercase tracking-widest text-accent">Report</span>
                  <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                    {repoNameFromUrl(report.repoUrl)}
                  </h1>
                  <a
                    href={report.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-muted-dark hover:text-accent"
                  >
                    {report.repoUrl}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={report.status} />
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="rounded-lg border border-border-subtle px-4 py-2 font-mono text-xs text-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
                  >
                    {isDownloading ? 'Preparing…' : 'Download .md'}
                  </button>
                </div>
              </div>

              {report.finalOutcome && (
                <div className="rounded-2xl border border-border-subtle bg-surface/50 p-6">
                  <p className="font-mono text-sm leading-relaxed text-foreground/90">{report.finalOutcome}</p>
                </div>
              )}

              {report.stack && (
                <Section title="Stack">
                  <StackSummary stack={report.stack} />
                </Section>
              )}

              {STRUCTURAL_STATUSES.has(report.status) && report.error && (
                <Section title="Input validation">
                  <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-3 font-mono text-xs leading-relaxed text-yellow-500/90">
                    {report.error}
                  </pre>
                </Section>
              )}

              {report.attempts?.length > 0 && (
                <div className="space-y-4">
                  <h2 className="font-mono text-xs uppercase tracking-widest text-muted-dark">
                    Fix attempts ({report.attempts.length})
                  </h2>
                  {report.attempts.map((a) => (
                    <AttemptCard key={a.attemptNumber} attempt={a} />
                  ))}
                </div>
              )}

              {FAILURE_STATUSES.has(report.status) && report.error && (
                <Section title="Final error">
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-3 font-mono text-xs leading-relaxed text-error/90">
                    {report.error}
                  </pre>
                </Section>
              )}

              {report.attempts?.length === 0 && !STRUCTURAL_STATUSES.has(report.status) && (
                <p className="py-8 text-center font-mono text-xs text-muted-dark">
                  No fix attempts were needed for this job.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
