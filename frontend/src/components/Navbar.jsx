import { motion } from 'framer-motion'
import MagneticButton from './ui/MagneticButton'

export default function Navbar() {
  const links = ['How it works', 'Features', 'Pricing']

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 z-50 w-full border-b border-border-subtle/50 bg-background/70 backdrop-blur-xl"
    >
      <div className="section-container-wide flex h-16 items-center justify-between">
        <a href="#" className="group flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 transition-colors group-hover:bg-accent/20">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M3 9l4 4 8-8"
                stroke="#14F5C6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Repo<span className="text-accent">Revive</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
              className="text-sm text-muted transition-colors duration-200 hover:text-foreground"
            >
              {link}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <MagneticButton variant="ghost" className="!px-4 !py-2 hidden sm:inline-flex">
            Sign in
          </MagneticButton>
          <MagneticButton variant="primary" className="!px-5 !py-2.5 !text-xs">
            Try it free
          </MagneticButton>
        </div>
      </div>
    </motion.nav>
  )
}
