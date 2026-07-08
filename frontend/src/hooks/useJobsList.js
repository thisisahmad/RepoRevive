import { useEffect, useRef, useState } from 'react'
import { listJobs } from '../lib/api'

const POLL_INTERVAL_MS = 3000

/** Fetches the current user's job history and keeps it fresh while mounted. */
export function useJobsList() {
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const data = await listJobs()
        if (cancelled) return
        setJobs(data)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
      if (!cancelled) timerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
    }

    tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { jobs, error, isLoading }
}
