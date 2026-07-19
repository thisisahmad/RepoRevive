import { useCallback, useEffect, useRef, useState } from 'react'
import { getJob, isTerminalStatus } from '../lib/api'

const POLL_INTERVAL_MS = 1500

/** Polls GET /api/jobs/:id until the job reaches a terminal status. */
export function useJobPolling(jobId) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!jobId) return
    try {
      const data = await getJob(jobId)
      setJob(data)
    } catch (err) {
      setError(err.message)
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) {
      setJob(null)
      setError(null)
      return
    }

    let cancelled = false

    const tick = async () => {
      try {
        const data = await getJob(jobId)
        if (cancelled) return
        setJob(data)
        if (!isTerminalStatus(data.status)) {
          timerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
        }
      } catch (err) {
        if (cancelled) return
        setError(err.message)
      }
    }

    tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [jobId])

  return { job, error, refresh }
}
