import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import Logo from './ui/Logo'
import TerminalShell from './ui/TerminalShell'

export default function AuthLayout({ title, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div className="absolute inset-0 bg-mesh-gradient opacity-50" />
      <div className="pointer-events-none absolute inset-0 noise-overlay" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Logo />
        </Link>

        <TerminalShell title={title}>
          <div className="p-8">{children}</div>
        </TerminalShell>

        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </motion.div>
    </div>
  )
}
