import { motion } from 'framer-motion'

const beforeLines = [
  { num: 1, content: '{', type: 'normal' },
  { num: 2, content: '  "dependencies": {', type: 'normal' },
  { num: 3, content: '    "webpack": "^4.46.0",', type: 'removed' },
  { num: 4, content: '    "react": "^16.14.0",', type: 'removed' },
  { num: 5, content: '    "node-sass": "^4.14.1"', type: 'removed' },
  { num: 6, content: '  }', type: 'normal' },
  { num: 7, content: '}', type: 'normal' },
]

const afterLines = [
  { num: 1, content: '{', type: 'normal' },
  { num: 2, content: '  "dependencies": {', type: 'normal' },
  { num: 3, content: '    "webpack": "^5.94.0",', type: 'added' },
  { num: 4, content: '    "react": "^18.3.1",', type: 'added' },
  { num: 5, content: '    "sass": "^1.77.0"', type: 'added' },
  { num: 6, content: '  }', type: 'normal' },
  { num: 7, content: '}', type: 'normal' },
]

function DiffPanel({ title, filename, lines, variant }) {
  const getLineStyle = (type) => {
    switch (type) {
      case 'removed':
        return 'bg-error/10 text-error border-l-2 border-error'
      case 'added':
        return 'bg-accent/10 text-accent border-l-2 border-accent'
      default:
        return 'text-muted border-l-2 border-transparent'
    }
  }

  const prefix = (type) => {
    if (type === 'removed') return '-'
    if (type === 'added') return '+'
    return ' '
  }

  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-border-subtle bg-surface/80">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              variant === 'before' ? 'bg-error' : 'bg-accent'
            }`}
          />
          <span className="font-mono text-xs text-muted">{title}</span>
        </div>
        <span className="font-mono text-xs text-muted-dark">{filename}</span>
      </div>
      <div className="overflow-x-auto p-2 font-mono text-xs leading-6 sm:text-sm">
        {lines.map((line) => (
          <div
            key={line.num}
            className={`flex px-2 ${getLineStyle(line.type)}`}
          >
            <span className="mr-3 w-4 shrink-0 select-none text-muted-dark">
              {prefix(line.type)}
            </span>
            <span className="mr-4 w-6 shrink-0 select-none text-muted-dark">
              {line.num}
            </span>
            <span>{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LiveDemo() {
  return (
    <section className="relative py-section">
      <div className="absolute inset-0 bg-mesh-gradient opacity-50" />

      <div className="section-container relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center"
        >
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Live preview
          </span>
          <h2 className="mt-4 font-display text-display-md font-bold tracking-tight">
            See the fix before you download
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Every change is documented in a clear diff report so you know exactly
            what was patched and why.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden rounded-2xl border border-border p-1 shadow-card"
        >
          <div className="flex items-center gap-2 rounded-t-xl bg-surface-elevated px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-error/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-accent/80" />
            <span className="ml-2 font-mono text-xs text-muted-dark">
              package.json — diff report
            </span>
          </div>

          <div className="flex flex-col gap-px bg-border-subtle md:flex-row">
            <DiffPanel
              title="Before"
              filename="package.json"
              lines={beforeLines}
              variant="before"
            />
            <DiffPanel
              title="After"
              filename="package.json"
              lines={afterLines}
              variant="after"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted"
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-error" /> Deprecated removed
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" /> Modern replacements
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-500" /> 3 files changed
          </span>
        </motion.div>
      </div>
    </section>
  )
}
