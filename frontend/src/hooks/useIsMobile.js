import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)
    handler(media)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return isMobile
}
