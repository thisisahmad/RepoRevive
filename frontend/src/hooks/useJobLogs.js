import { useEffect, useRef, useState } from 'react'
import { getJobLogs } from '../lib/api'

const POLL_INTERVAL_MS = 1500

/**
 * Polls GET /api/jobs/:id/logs so the UI can show a live trace of what the
 * pipeline (and the AI) is doing. Keeps polling while `isDone` is false; when
 * the job reaches a terminal status the caller flips `isDone` true, which
 * triggers one final fetch (to capture the closing events) and then stops.
 */
export function useJobLogs(jobId, isDone) {
  const [events, setEvents] = useState([])
  const timerRef = useRef(null)

  useEffect(() => {
    if (!jobId) {
      setEvents([])
      return
    }

    let cancelled = false

    const tick = async () => {
      try {
        const data = await getJobLogs(jobId)
        if (cancelled) return
        setEvents(data?.events ?? [])
      } catch {
        // transient errors (e.g. log file not written yet) — just retry
      }
      if (!cancelled && !isDone) {
        timerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [jobId, isDone])

  return events
}
