import { useEffect, useRef, useState } from 'react'

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour12: false })
  } catch {
    return ''
  }
}

function pct(n) {
  return `${Math.round((Number(n) || 0) * 100)}%`
}

function firstLine(s, max = 180) {
  const line = String(s ?? '').split('\n')[0].trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}

/**
 * Turns one structured log event into a human line for the feed.
 * `ai: true` marks steps the model itself drove, so they can be highlighted.
 * Returns null for events we don't want to surface.
 */
function describe(ev) {
  const d = ev.data || {}
  switch (ev.eventType) {
    case 'job_created':
      return { tone: 'info', text: 'Job created — cloning repository' }
    case 'stack_detected':
      return {
        tone: 'info',
        text: `Detected ${d.language} project (${d.packageManager})${d.entryPoint ? `, entry: ${d.entryPoint}` : ''}`,
      }
    case 'stack_detection_failed':
      return { tone: 'warn', text: `Unsupported stack: ${firstLine(d.message)}` }
    case 'manifest_invalid':
    case 'manifest_conflict':
    case 'engine_mismatch':
      return { tone: 'warn', text: firstLine(d.message) }
    case 'install_started':
      return {
        tone: 'info',
        text: d.attemptNumber ? `Reinstalling dependencies (attempt ${d.attemptNumber})…` : 'Installing dependencies…',
      }
    case 'install_succeeded':
      return { tone: 'ok', text: 'Dependencies installed' }
    case 'install_failed':
      return { tone: 'error', text: `Install failed — ${firstLine(d.error)}` }
    case 'run_started':
      return { tone: 'info', text: `Starting app: ${d.command}` }
    case 'run_succeeded':
      return { tone: 'ok', text: 'App started successfully' }
    case 'run_failed':
      return { tone: 'error', text: `App crashed (exit ${d.exitCode ?? '?'})` }
    case 'diagnosis_started':
      return { tone: 'ai', ai: true, text: 'AI is analyzing the error…' }
    case 'diagnosis_completed': {
      let text = `AI diagnosis: ${d.category}`
      if (d.affectedPackage) text += ` (${d.affectedPackage})`
      text += ` — confidence ${pct(d.confidence)}`
      const up = d.suggestedUpgrade
      if (up && (up.package || up.from || up.to)) {
        text += ` · suggests ${up.package ?? ''} ${up.from ?? '?'} → ${up.to ?? '?'}`.replace(/\s+/g, ' ')
      }
      return { tone: 'ai', ai: true, text }
    }
    case 'fix_attempt_started':
      return {
        tone: 'ai',
        ai: true,
        text: `AI fix attempt ${d.attemptNumber} started${d.steeredByReflection ? ' (guided by last reflection)' : ''}…`,
      }
    case 'fix_attempt_completed': {
      const files = Array.isArray(d.filesChanged) ? d.filesChanged : []
      const text = files.length
        ? `AI edited ${files.length} file${files.length > 1 ? 's' : ''}: ${files.join(', ')}`
        : `AI attempt ${d.attemptNumber} made no file changes`
      const detail = d.outcome ? firstLine(d.outcome, 220) : null
      return { tone: 'ai', ai: true, text, detail }
    }
    case 'reflection_completed': {
      const bits = []
      if (d.failureReason) bits.push(firstLine(d.failureReason))
      if (d.nextStrategy) bits.push(`Next: ${firstLine(d.nextStrategy)}`)
      bits.push(d.shouldRetry ? 'Decision: retry' : 'Decision: stop (unfixable)')
      return { tone: 'ai', ai: true, text: `AI reflection — ${bits.join(' · ')}` }
    }
    case 'job_succeeded':
      return { tone: 'ok', text: 'Done — the app runs. Result packaged for download.' }
    case 'job_failed':
      return { tone: 'error', text: 'Job failed after exhausting fix attempts.' }
    case 'job_failed_unfixable':
      return { tone: 'error', text: 'Stopped early — AI judged the failure unfixable.' }
    default:
      return null
  }
}

const TONE_TEXT = {
  info: 'text-muted',
  ok: 'text-accent',
  error: 'text-error',
  warn: 'text-yellow-500',
  ai: 'text-sky-300',
}

const TONE_DOT = {
  info: 'bg-muted-dark',
  ok: 'bg-accent',
  error: 'bg-error',
  warn: 'bg-yellow-500',
  ai: 'bg-sky-400',
}

const STATUS_HINT = {
  queued: 'waiting in the queue',
  cloning: 'cloning the repository',
  detecting: 'detecting the stack',
  installing: 'installing dependencies (can take a few minutes)',
  running: 'starting the app',
  fixing: 'the AI is working on a fix',
}

/**
 * Live, human-readable trace of what the pipeline and the AI are doing,
 * built from the job's structured log events. Auto-scrolls as new lines land,
 * and shows a "working…" heartbeat so long steps never look frozen.
 */
export default function AiActivityLog({ events, running, currentStatus }) {
  const scrollRef = useRef(null)
  const [now, setNow] = useState(Date.now())

  const lines = (events || [])
    .map((ev) => {
      const d = describe(ev)
      return d ? { ...d, key: `${ev.timestamp}-${ev.eventType}`, time: fmtTime(ev.timestamp), ts: ev.timestamp } : null
    })
    .filter(Boolean)

  // Tick once a second while running so the "seconds since last update" counter
  // keeps moving even when no new events are arriving (e.g. a long install).
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  if (lines.length === 0) return null

  const lastTs = lines[lines.length - 1]?.ts
  const secondsSince = lastTs ? Math.max(0, Math.round((now - new Date(lastTs).getTime()) / 1000)) : 0
  const hint = STATUS_HINT[currentStatus] || 'working'

  return (
    <div className="border-t border-border-subtle">
      <div className="flex items-center justify-between px-6 pt-4">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-dark">AI activity</span>
        {running && (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-sky-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
            </span>
            live
          </span>
        )}
      </div>

      <div ref={scrollRef} className="max-h-64 space-y-1.5 overflow-y-auto px-6 py-3">
        {lines.map((line) => (
          <div key={line.key} className="flex items-start gap-2.5 font-mono text-xs leading-relaxed">
            <span className="mt-1 shrink-0 tabular-nums text-[10px] text-muted-dark">{line.time}</span>
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[line.tone]}`} />
            <span className={`min-w-0 break-words ${TONE_TEXT[line.tone]}`}>
              {line.ai && (
                <span className="mr-1.5 rounded bg-sky-400/10 px-1 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
                  AI
                </span>
              )}
              {line.text}
              {line.detail && <span className="mt-0.5 block text-[11px] text-muted-dark">{line.detail}</span>}
            </span>
          </div>
        ))}

        {running && (
          <div className="flex items-center gap-2.5 pt-1 font-mono text-xs text-muted-dark">
            <span className="w-[38px] shrink-0" />
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted-dark/40 border-t-sky-400" />
            <span>
              Working — {hint}
              {secondsSince > 3 && <span className="text-muted-dark/70"> · {secondsSince}s since last update</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
