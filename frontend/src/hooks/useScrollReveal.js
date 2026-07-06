import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function useScrollReveal(rootRef, config = {}) {
  useEffect(() => {
    if (!rootRef.current) return

    const ctx = gsap.context(() => {
      const elements = rootRef.current.querySelectorAll('[data-scroll-reveal]')

      elements.forEach((el, index) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            delay: index * 0.08,
            scrollTrigger: {
              trigger: el,
              start: 'top 85%',
              toggleActions: 'play none none none',
              ...config,
            },
          }
        )
      })
    }, rootRef)

    return () => ctx.revert()
  }, [rootRef, config])
}
