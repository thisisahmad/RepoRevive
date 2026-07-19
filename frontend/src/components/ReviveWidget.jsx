import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { createJob, downloadJobZip, isTerminalStatus } from '../lib/api'
import { takePendingRepoUrl } from '../lib/pendingRepo'
import { useJobPolling } from '../hooks/useJobPolling'
import RepoUrlForm from './RepoUrlForm'
import TerminalShell from './ui/TerminalShell'

const STATUS_ORDER = ['queued', 'cloning', 'detecting', 'installing', 'running']

const STEP_LABELS = {
  queued: 'Queued',
  cloning: 'Cloning repository',
  detecting: 'Detecting stack',
  installing: 'Installing dependencies',
  running: 'Starting app',
}

function friendlyError(message) {
  if (message === 'Failed to fetch') {
    return "Can't reach the RepoRevive backend — is it running on http://localhost:3000?"
  }
  return message
}

function StepRow({ label, state }) {
  return (
    <div className="flex items-center gap-3 font-mono text-sm">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {state === 'done' && (
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-accent" fill="none">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === 'active' && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
        )}
        {state === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-muted-dark" />}
        {state === 'error' && (
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-error" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span
        className={
          state === 'pending'
            ? 'text-muted-dark'
            : state === 'error'
              ? 'text-error'
              : state === 'active'
                ? 'text-foreground'
                : 'text-muted'
        }
      >
        {label}
      </span>
    </div>
  )
}

function Stepper({ status }) {
  const currentIndex = STATUS_ORDER.indexOf(status)

  return (
    <div className="space-y-3 p-6">
      {STATUS_ORDER.map((key, i) => {
        let state = 'pending'
        if (currentIndex === -1) {
          state = i === 0 ? 'done' : 'pending'
        } else if (i < currentIndex) {
          state = 'done'
        } else if (i === currentIndex) {
          state = 'active'
        }
        return <StepRow key={key} label={STEP_LABELS[key]} state={state} />
      })}
    </div>
  )
}

function StackSummary({ stack }) {
  if (!stack) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs sm:text-sm">
      <dt className="text-muted-dark">Language</dt>
      <dd className="text-foreground">{stack.language}</dd>
      <dt className="text-muted-dark">Package manager</dt>
      <dd className="text-foreground">{stack.packageManager}</dd>
      <dt className="text-muted-dark">Install</dt>
      <dd className="text-foreground">{stack.installCommand}</dd>
      <dt className="text-muted-dark">Start</dt>
      <dd className="text-foreground">{stack.startCommand ?? '—'}</dd>
    </dl>
  )
}

/** repoUrl is normalized to https://github.com/<owner>/<repo>.git — pull out <repo>. */
function repoNameFromUrl(repoUrl) {
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/)
  return match ? match[1] : 'repo'
}

function DownloadButton({ jobId, repoUrl }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState(null)

  const handleDownload = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    setError(null)
    try {
      const blob = await downloadJobZip(jobId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reporevive-${repoNameFromUrl(repoUrl)}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-display text-sm font-semibold text-background shadow-glow-accent transition-opacity hover:shadow-glow-lg disabled:opacity-60"
      >
        {isDownloading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/40 border-t-background" />
        )}
        {isDownloading ? 'Preparing download…' : 'Download ZIP'}
      </button>
      {error && <p className="mt-2 font-mono text-xs text-error">{error}</p>}
    </div>
  )
}

function ViewReportLink({ jobId }) {
  return (
    <Link
      to={`/jobs/${jobId}/report`}
      className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-5 py-2.5 font-mono text-sm text-foreground transition-colors hover:border-accent/40 hover:text-accent"
    >
      View Report
    </Link>
  )
}

function ResultPanel({ job }) {
  if (job.status === 'succeeded') {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-accent">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-mono text-sm font-medium">It runs.</span>
        </div>
        <StackSummary stack={job.stack} />
        <DownloadButton jobId={job.id} repoUrl={job.repoUrl} />
      </div>
    )
  }

  const STRUCTURAL_LABELS = {
    unsupported_stack: 'Unsupported stack',
    invalid_manifest: 'Invalid manifest',
    conflicting_manifests: 'Conflicting manifests',
    engine_version_mismatch: 'Engine version mismatch',
  }
  if (STRUCTURAL_LABELS[job.status]) {
    return (
      <div className="space-y-3 p-6">
        <div className="flex items-center gap-2 text-yellow-500">
          <span className="font-mono text-sm font-medium">{STRUCTURAL_LABELS[job.status]}</span>
        </div>
        <p className="font-mono text-xs leading-relaxed text-muted sm:text-sm">{job.error}</p>
        {job.status !== 'unsupported_stack' && (
          <p className="font-mono text-xs text-muted-dark">
            This is a structural problem with the repo's setup, caught before install — the AI fix loop is
            intentionally not run on it.
          </p>
        )}
      </div>
    )
  }

  const unfixable = job.status === 'failed_unfixable'

  return (
    <div className="space-y-3 p-6">
      <div className="flex items-center gap-2 text-error">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="font-mono text-sm font-medium">
          {unfixable ? 'Stopped early — judged unfixable' : 'Failed after install/run'}
        </span>
      </div>
      {job.stack && <StackSummary stack={job.stack} />}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-3 font-mono text-xs leading-relaxed text-error/90">
        {job.error}
      </pre>
      <p className="font-mono text-xs text-muted-dark">
        {unfixable
          ? "The AI reflected on its attempts and concluded this failure can't be fixed within the current approach — see the report for its reasoning."
          : 'The AI auto-fix loop exhausted its attempts. See the report for the full reasoning trace.'}
      </p>
      <ViewReportLink jobId={job.id} />
    </div>
  )
}

/** The interactive "paste a repo, watch it run" widget — lives on the dashboard. */
export default function ReviveWidget() {
  const [repoUrl, setRepoUrl] = useState('')
  const [jobId, setJobId] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [startedAt, setStartedAt] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const { job, error: pollError } = useJobPolling(jobId)

  const submit = async (url) => {
    if (!url.trim() || isSubmitting) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const created = await createJob(url.trim())
      setJobId(created.id)
      setStartedAt(Date.now())
      setElapsedMs(0)
    } catch (err) {
      setSubmitError(friendlyError(err.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Landing page (or a post-login redirect) may have stashed a repo URL the
  // user wants revived immediately — sessionStorage's read-and-clear means
  // this is safe even if the effect runs twice in dev StrictMode.
  useEffect(() => {
    const pending = takePendingRepoUrl()
    if (pending) {
      setRepoUrl(pending)
      submit(pending)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tickRef = useRef(null)
  useEffect(() => {
    if (!jobId || (job && isTerminalStatus(job.status))) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 1000)
    return () => clearInterval(tickRef.current)
  }, [jobId, job, startedAt])

  const handleSubmit = (e) => {
    e.preventDefault()
    submit(repoUrl)
  }

  const handleReset = () => {
    setJobId(null)
    setSubmitError(null)
    setRepoUrl('')
  }

  const isRunning = jobId && (!job || !isTerminalStatus(job.status))
  const isLongRunning = isRunning && elapsedMs > 45_000

  return (
    <TerminalShell title="reporevive --job">
      <RepoUrlForm
        value={repoUrl}
        onChange={setRepoUrl}
        onSubmit={handleSubmit}
        isBusy={isRunning}
        isSubmitting={isSubmitting}
      />

      {submitError && <p className="px-6 pb-4 -mt-2 font-mono text-xs text-error">{submitError}</p>}
      {pollError && <p className="px-6 pb-4 -mt-2 font-mono text-xs text-error">{friendlyError(pollError)}</p>}

      <AnimatePresence mode="wait">
        {job && (
          <motion.div
            key={job.status + (job.id ?? '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-border-subtle"
          >
            {isTerminalStatus(job.status) ? <ResultPanel job={job} /> : <Stepper status={job.status} />}
          </motion.div>
        )}
      </AnimatePresence>

      {isLongRunning && (
        <p className="border-t border-border-subtle px-6 py-3 font-mono text-xs text-muted-dark">
          Larger repos can take a few minutes to install — hang tight.
        </p>
      )}

      {job && isTerminalStatus(job.status) && (
        <div className="border-t border-border-subtle px-6 py-4">
          <button type="button" onClick={handleReset} className="font-mono text-xs text-accent hover:underline">
            ← Try another repo
          </button>
        </div>
      )}
    </TerminalShell>
  )
}
