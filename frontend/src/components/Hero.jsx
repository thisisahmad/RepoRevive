import { lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import TextReveal from './ui/TextReveal'
import MagneticButton from './ui/MagneticButton'
import CodeTerminal from './CodeTerminal'
import { useIsMobile } from '../hooks/useIsMobile'

const HeroScene = lazy(() => import('./HeroScene'))

function MobileBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-mesh-gradient" />
      <div className="absolute left-1/2 top-1/3 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-[100px]" />
      <div className="absolute right-0 top-0 h-[300px] w-[300px] rounded-full bg-accent/8 blur-[80px]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#14F5C6" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  )
}

function DesktopBackground() {
  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 bg-mesh-gradient animate-pulse" />
      }
    >
      <HeroScene />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background" />
    </Suspense>
  )
}

export default function Hero() {
  const isMobile = useIsMobile()

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-24">
      {isMobile ? <MobileBackground /> : <DesktopBackground />}

      {/* Premium atmosphere layers */}
      <div className="pointer-events-none absolute inset-0 hero-spotlight" />
      <div className="pointer-events-none absolute inset-0 hero-vignette" />
      <div className="pointer-events-none absolute inset-0 noise-overlay" />

      <div className="section-container relative z-10 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-xs text-accent">AI-powered repo revival</span>
        </motion.div>

        <h1 className="flex flex-col items-center gap-6 font-display text-hero font-bold leading-[1.05] tracking-[-0.02em] md:gap-10">
          <TextReveal text="Paste a link." delay={0.2} className="drop-shadow-[0_2px_24px_rgba(255,255,255,0.08)]" />
          <TextReveal
            text="We'll make it run."
            delay={0.55}
            wordClassName="text-shimmer-accent text-glow-accent"
          />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-xl text-lg text-muted md:text-xl"
        >
          RepoRevive clones broken GitHub repos, auto-fixes deprecated dependencies,
          and delivers a working codebase — in minutes, not days.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <MagneticButton variant="primary">Try it free</MagneticButton>
          <MagneticButton variant="secondary">See how it works</MagneticButton>
        </motion.div>

        <div className="mt-20 w-full">
          <CodeTerminal />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2 text-muted-dark"
        >
          <span className="font-mono text-xs uppercase tracking-widest">Scroll</span>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-muted-dark">
            <path d="M10 4v12M10 16l-4-4M10 16l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  )
}
