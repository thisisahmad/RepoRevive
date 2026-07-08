import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { peekPendingRepoUrl } from '../lib/pendingRepo'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const pendingRepoUrl = peekPendingRepoUrl()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await register(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="reporevive --register"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {pendingRepoUrl && (
        <p className="mb-6 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 font-mono text-xs text-muted">
          Create an account to revive <span className="text-accent">{pendingRepoUrl}</span>
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block font-mono text-xs text-muted-dark">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border-subtle bg-background/60 px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-dark focus:border-accent/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block font-mono text-xs text-muted-dark">Password</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-border-subtle bg-background/60 px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-dark focus:border-accent/50 focus:outline-none"
          />
        </div>

        {error && <p className="font-mono text-xs text-error">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-accent px-6 py-2.5 font-display text-sm font-semibold text-background shadow-glow-accent transition-opacity hover:shadow-glow-lg disabled:opacity-50"
        >
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
