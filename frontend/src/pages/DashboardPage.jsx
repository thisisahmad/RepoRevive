import DashboardStats from '../components/DashboardStats'
import JobHistoryList from '../components/JobHistoryList'
import ReviveWidget from '../components/ReviveWidget'
import Logo from '../components/ui/Logo'
import { useAuth } from '../context/AuthContext'
import { useJobsList } from '../hooks/useJobsList'

function DashboardHeader({ email, onLogout }) {
  return (
    <header className="border-b border-border-subtle/50 bg-background/70 backdrop-blur-xl">
      <div className="section-container-wide flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo />
        </div>

        <div className="flex items-center gap-4">
          {email && <span className="hidden font-mono text-xs text-muted sm:inline">{email}</span>}
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-border-subtle px-4 py-2 font-mono text-xs text-muted transition-colors hover:border-error/40 hover:text-error"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const { jobs, isLoading } = useJobsList()

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 bg-mesh-gradient opacity-30" />
      <DashboardHeader email={user?.email} onLogout={logout} />

      <main className="section-container relative py-16">
        <div className="mb-10 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-accent">Dashboard</span>
          <h1 className="mt-4 font-display text-display-md font-bold tracking-tight">Revive a repo</h1>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Paste a public GitHub URL. We'll clone it, install it, and try to run it in an isolated
            container.
          </p>
        </div>

        <div className="mx-auto max-w-xl space-y-8">
          <ReviveWidget />
          <DashboardStats jobs={jobs} />
          <JobHistoryList jobs={jobs} isLoading={isLoading} />
        </div>
      </main>
    </div>
  )
}
