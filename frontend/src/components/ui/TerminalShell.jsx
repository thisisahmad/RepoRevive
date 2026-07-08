export default function TerminalShell({ title, children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border p-1 shadow-card ${className}`}>
      <div className="flex items-center gap-2 rounded-t-xl bg-surface-elevated px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-error/80" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
        <div className="h-3 w-3 rounded-full bg-accent/80" />
        <span className="ml-2 font-mono text-xs text-muted-dark">{title}</span>
      </div>
      <div className="rounded-b-xl bg-surface/80">{children}</div>
    </div>
  )
}
