import { isTerminalStatus } from '../lib/api'

function StatTile({ label, value, accentClass }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface/60 px-5 py-4">
      <div className={`font-display text-2xl font-bold ${accentClass}`}>{value}</div>
      <div className="mt-1 font-mono text-xs uppercase tracking-wide text-muted-dark">{label}</div>
    </div>
  )
}

export default function DashboardStats({ jobs }) {
  const total = jobs.length
  const running = jobs.filter((j) => !isTerminalStatus(j.status)).length
  const succeeded = jobs.filter((j) => j.status === 'succeeded').length
  const failed = jobs.filter((j) => j.status === 'failed' || j.status === 'unsupported_stack').length

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Total" value={total} accentClass="text-foreground" />
      <StatTile label="Running" value={running} accentClass="text-accent" />
      <StatTile label="Succeeded" value={succeeded} accentClass="text-accent" />
      <StatTile label="Failed" value={failed} accentClass="text-error" />
    </div>
  )
}
