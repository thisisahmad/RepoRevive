import { motion } from 'framer-motion'
import Logo from './ui/Logo'
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
        <a href="#" className="flex items-center gap-2">
          <Logo />
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
          <MagneticButton variant="ghost" className="!px-4 !py-2 hidden sm:inline-flex" to="/login">
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
