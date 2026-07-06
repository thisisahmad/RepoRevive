import { motion } from 'framer-motion'
import AnimatedCounter from './ui/AnimatedCounter'

const stats = [
  { value: 500, suffix: '+', label: 'Repos revived' },
  { value: 98, suffix: '%', label: 'Build success rate' },
  { value: 12, suffix: 'min', label: 'Avg. fix time' },
  { value: 40, suffix: '+', label: 'Stacks supported' },
]

export default function Stats() {
  return (
    <section className="border-y border-border-subtle py-16">
      <div className="section-container-wide">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <div className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} duration={2.5} />
              </div>
              <p className="mt-2 text-sm text-muted">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
