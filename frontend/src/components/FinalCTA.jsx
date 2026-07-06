import { motion } from 'framer-motion'
import MagneticButton from './ui/MagneticButton'

export default function FinalCTA() {
  return (
    <section className="relative py-section">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface/50 px-8 py-20 text-center md:px-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-mesh-gradient" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[200px] w-[400px] -translate-x-1/2 rounded-full bg-accent/10 blur-[80px]" />

          <div className="relative">
            <h2 className="font-display text-display-sm font-bold tracking-tight">
              Ready to revive your first repo?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Paste a GitHub link and get a working codebase in minutes.
              No credit card required.
            </p>
            <div className="mt-8">
              <MagneticButton variant="primary">Try it free</MagneticButton>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
