import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useIsMobile } from '../hooks/useIsMobile'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  {
    number: '01',
    title: 'Paste link',
    description:
      'Drop any GitHub repo URL — public or private via token. We handle the rest.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Clone & detect stack',
    description:
      'We clone the repo and identify every framework, runtime, and dependency version.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'AI diagnoses & fixes',
    description:
      'Our AI resolves deprecated APIs, version conflicts, and broken configs automatically.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Download working repo',
    description:
      'Get a fully patched repo with a detailed diff report — ready to deploy.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
]

export default function HowItWorks() {
  const sectionRef = useRef(null)
  const lineRef = useRef(null)
  const stepsRef = useRef([])
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isMobile || !sectionRef.current || !lineRef.current) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        lineRef.current,
        { strokeDashoffset: 1000 },
        {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            end: 'bottom 40%',
            scrub: 1,
          },
        }
      )

      stepsRef.current.forEach((el, i) => {
        if (!el) return
        gsap.fromTo(
          el,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
            delay: i * 0.1,
          }
        )
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [isMobile])

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative py-section"
    >
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-20 text-center"
        >
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            How it works
          </span>
          <h2 className="mt-4 font-display text-display-md font-bold tracking-tight">
            From broken to running
            <br />
            <span className="text-muted">in four steps</span>
          </h2>
        </motion.div>

        <div className="relative">
          {!isMobile && (
            <svg
              className="absolute left-1/2 top-0 hidden h-full w-4 -translate-x-1/2 md:block"
              preserveAspectRatio="none"
            >
              <line
                ref={lineRef}
                x1="50%"
                y1="0"
                x2="50%"
                y2="100%"
                stroke="url(#lineGradient)"
                strokeWidth="2"
                strokeDasharray="1000"
                strokeDashoffset="1000"
              />
              <defs>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14F5C6" stopOpacity="0" />
                  <stop offset="20%" stopColor="#14F5C6" stopOpacity="0.8" />
                  <stop offset="80%" stopColor="#14F5C6" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#14F5C6" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          )}

          <div className="space-y-16 md:space-y-24">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                ref={(el) => (stepsRef.current[i] = el)}
                initial={isMobile ? { opacity: 0, y: 40 } : undefined}
                whileInView={isMobile ? { opacity: 1, y: 0 } : undefined}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col items-center gap-8 md:flex-row ${
                  i % 2 === 1 ? 'md:flex-row-reverse' : ''
                } ${isMobile ? '' : 'opacity-0'}`}
              >
                <div className="flex-1 md:text-right" style={i % 2 === 1 ? { textAlign: 'left' } : {}}>
                  <span className="font-mono text-sm text-accent">{step.number}</span>
                  <h3 className="mt-2 font-display text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 max-w-md text-muted">{step.description}</p>
                </div>

                <div className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent shadow-glow">
                  {step.icon}
                </div>

                <div className="hidden flex-1 md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
