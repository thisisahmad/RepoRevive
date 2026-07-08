import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { savePendingRepoUrl } from '../lib/pendingRepo'
import RepoUrlForm from './RepoUrlForm'
import TerminalShell from './ui/TerminalShell'

export default function LiveDemo() {
  const [repoUrl, setRepoUrl] = useState('')
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!repoUrl.trim()) return
    savePendingRepoUrl(repoUrl.trim())
    navigate(isAuthenticated ? '/dashboard' : '/login')
  }

  return (
    <section id="live-demo" className="relative py-section">
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
            Live demo
          </span>
          <h2 className="mt-4 font-display text-display-md font-bold tracking-tight">
            Try it on a real repo
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Paste a public GitHub URL. We'll clone it, install it, and try to run it
            in an isolated container.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-xl"
        >
          <TerminalShell title="reporevive --job">
            <RepoUrlForm value={repoUrl} onChange={setRepoUrl} onSubmit={handleSubmit} />
          </TerminalShell>
        </motion.div>
      </div>
    </section>
  )
}
