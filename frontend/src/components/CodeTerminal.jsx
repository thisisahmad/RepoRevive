import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const lines = [
  { type: 'prompt', text: '$ npm install' },
  { type: 'error', text: 'ERR! deprecated webpack@4.46.0' },
  { type: 'error', text: 'ERR! peer dep react@16.x — unmet' },
  { type: 'fixing', text: '→ RepoRevive analyzing stack...' },
  { type: 'success', text: '✓ Updated webpack → v5.94.0' },
  { type: 'success', text: '✓ Migrated react → v18.3.1' },
  { type: 'success', text: '✓ Build passing — repo revived' },
]

export default function CodeTerminal() {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleCount((c) => (c >= lines.length ? 1 : c + 1))
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  const getLineClass = (type) => {
    switch (type) {
      case 'error':
        return 'text-error'
      case 'success':
        return 'text-accent'
      case 'fixing':
        return 'text-muted animate-pulse'
      default:
        return 'text-muted-dark'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-lg"
    >
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface/80 backdrop-blur-sm shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-error/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-accent/80" />
          <span className="ml-2 font-mono text-xs text-muted-dark">terminal</span>
        </div>
        <div className="space-y-1.5 p-4 font-mono text-sm leading-relaxed">
          {lines.slice(0, visibleCount).map((line, i) => (
            <motion.div
              key={`${line.text}-${i}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className={getLineClass(line.type)}
            >
              {line.text}
            </motion.div>
          ))}
          <span className="inline-block h-4 w-2 animate-pulse bg-accent" />
        </div>
      </div>
    </motion.div>
  )
}
