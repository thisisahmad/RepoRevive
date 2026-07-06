import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useIsMobile } from '../hooks/useIsMobile'

gsap.registerPlugin(ScrollTrigger)

const fragments = [
  { text: '{ fix }', x: '8%', size: 'text-sm', rotate: -12 },
  { text: 'ERR!', x: '88%', size: 'text-xs', rotate: 8 },
  { text: 'npm run build', x: '92%', size: 'text-[10px]', rotate: -6 },
  { text: 'git clone', x: '5%', size: 'text-xs', rotate: 14 },
  { text: '✓ patched', x: '78%', size: 'text-sm', rotate: -18 },
  { text: 'webpack → v5', x: '12%', size: 'text-[10px]', rotate: 6 },
  { text: 'deprecated', x: '85%', size: 'text-xs', rotate: -10 },
  { text: 'revived', x: '18%', size: 'text-sm', rotate: 12 },
]

const streaks = [
  { x: '15%', width: 1, height: 120, delay: 0 },
  { x: '42%', width: 2, height: 180, delay: 0.15 },
  { x: '68%', width: 1, height: 140, delay: 0.3 },
  { x: '91%', width: 2, height: 200, delay: 0.08 },
]

export default function ScrollFloatLayer() {
  const containerRef = useRef(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isMobile || !containerRef.current) return

    const ctx = gsap.context(() => {
      const items = containerRef.current.querySelectorAll('[data-float]')

      items.forEach((el, i) => {
        const speed = 0.6 + (i % 5) * 0.25
        const drift = i % 2 === 0 ? -80 : 80

        gsap.fromTo(
          el,
          { y: '-20vh', x: 0, opacity: 0.2, scale: 0.85 },
          {
            y: '120vh',
            x: drift,
            opacity: 1,
            scale: 1.15,
            ease: 'none',
            scrollTrigger: {
              trigger: document.body,
              start: 'top top',
              end: 'bottom bottom',
              scrub: 0.4 + (i % 3) * 0.2,
            },
          }
        )

        gsap.to(el, {
          rotation: `+=${i % 2 === 0 ? 25 : -25}`,
          scale: 1 + (i % 4) * 0.08,
          ease: 'none',
          scrollTrigger: {
            trigger: document.body,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.2,
          },
        })
      })

      const beams = containerRef.current.querySelectorAll('[data-beam]')
      beams.forEach((el, i) => {
        gsap.fromTo(
          el,
          { y: '-30vh', scaleY: 0.3, opacity: 0 },
          {
            y: '130vh',
            scaleY: 1.4,
            opacity: 0.7,
            ease: 'power1.inOut',
            scrollTrigger: {
              trigger: document.body,
              start: `${i * 8}% top`,
              end: `${60 + i * 10}% bottom`,
              scrub: 1.5,
            },
          }
        )
      })

      const glitches = containerRef.current.querySelectorAll('[data-glitch]')
      glitches.forEach((el) => {
        gsap.to(el, {
          x: '+=30',
          opacity: 0.9,
          duration: 0.08,
          repeat: -1,
          yoyo: true,
          repeatDelay: 0.4 + Math.random() * 0.8,
          ease: 'steps(2)',
        })
      })
    }, containerRef)

    return () => ctx.revert()
  }, [isMobile])

  if (isMobile) return null

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
      aria-hidden="true"
    >
      {fragments.map((frag, i) => (
        <div
          key={frag.text}
          data-float
          className={`absolute font-mono font-semibold uppercase tracking-[0.2em] text-accent ${frag.size}`}
          style={{
            left: frag.x,
            top: `${5 + i * 11}%`,
            transform: `rotate(${frag.rotate}deg)`,
            textShadow:
              '0 0 24px rgba(20, 245, 198, 0.9), 0 0 48px rgba(20, 245, 198, 0.4), 0 0 80px rgba(20, 245, 198, 0.15)',
          }}
        >
          {frag.text}
        </div>
      ))}

      {streaks.map((streak, i) => (
        <div
          key={i}
          data-beam
          className="absolute top-0 origin-top"
          style={{
            left: streak.x,
            width: streak.width,
            height: streak.height,
            background:
              'linear-gradient(180deg, transparent 0%, rgba(20,245,198,0.9) 35%, rgba(20,245,198,0.4) 70%, transparent 100%)',
            boxShadow: '0 0 24px rgba(20, 245, 198, 0.8), 0 0 60px rgba(20, 245, 198, 0.3)',
            filter: 'blur(0.5px)',
          }}
        />
      ))}

      <div
        data-float
        className="absolute left-[25%] top-[20%] h-32 w-32 rounded-full border border-accent/20"
        style={{
          boxShadow: 'inset 0 0 40px rgba(20, 245, 198, 0.15), 0 0 80px rgba(20, 245, 198, 0.1)',
        }}
      />

      <div
        data-float
        className="absolute right-[20%] top-[45%] h-20 w-20 rotate-45 border-2 border-accent/30"
        style={{
          boxShadow: '0 0 30px rgba(20, 245, 198, 0.4)',
        }}
      />

      <div
        data-glitch
        className="absolute left-[50%] top-[60%] h-px w-[40vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-accent to-transparent"
        style={{ boxShadow: '0 0 12px rgba(20, 245, 198, 0.9)' }}
      />

      <div
        data-glitch
        className="absolute left-[30%] top-[35%] h-px w-[25vw] bg-gradient-to-r from-transparent via-error/80 to-transparent"
        style={{ boxShadow: '0 0 10px rgba(255, 77, 106, 0.7)' }}
      />

      <svg
        data-float
        className="absolute left-[60%] top-[10%] h-40 w-40 text-accent/20"
        viewBox="0 0 100 100"
        fill="none"
      >
        <path
          d="M10 50 L40 20 L70 50 L40 80 Z"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeDasharray="4 4"
        />
        <path d="M40 20 L40 80" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      </svg>
    </div>
  )
}
