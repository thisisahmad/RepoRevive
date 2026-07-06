import { motion } from 'framer-motion'
import MagneticButton from './ui/MagneticButton'

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try RepoRevive on public repos with basic fixes.',
    features: [
      '3 repos per month',
      'Public repos only',
      'Basic dependency updates',
      'Diff report export',
    ],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For developers reviving repos regularly.',
    features: [
      'Unlimited repos',
      'Private repo support',
      'AI-powered deep fixes',
      'CI validation runs',
      'Priority processing',
      'Zip & GitHub push export',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '$99',
    period: '/month',
    description: 'For teams maintaining legacy codebases at scale.',
    features: [
      'Everything in Pro',
      'Up to 10 team members',
      'Shared workspace',
      'Bulk repo processing',
      'SSO & audit logs',
      'Dedicated support',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="relative py-section">
      <div className="absolute inset-0 bg-mesh-gradient opacity-30" />

      <div className="section-container relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-16 text-center"
        >
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Pricing
          </span>
          <h2 className="mt-4 font-display text-display-md font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Start free. Upgrade when you need private repos, deep AI fixes, or team features.
          </p>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-3">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className={`relative rounded-2xl p-8 transition-shadow duration-500 ${
                tier.highlighted
                  ? 'glow-border active glass-elevated shadow-glow-lg scale-[1.02]'
                  : 'glass hover:shadow-glow'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-accent px-4 py-1 font-mono text-xs font-medium text-background">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-display text-xl font-semibold">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted">{tier.period}</span>
                </div>
                <p className="mt-3 text-sm text-muted">{tier.description}</p>
              </div>

              <ul className="mb-8 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-muted">{feature}</span>
                  </li>
                ))}
              </ul>

              <MagneticButton
                variant={tier.highlighted ? 'primary' : 'secondary'}
                className="w-full !rounded-xl"
              >
                {tier.cta}
              </MagneticButton>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
