export default function RepoUrlForm({
  value,
  onChange,
  onSubmit,
  isBusy = false,
  isSubmitting = false,
  submitLabel = 'Revive it',
  busyLabel = 'Working…',
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 p-6 sm:flex-row">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://github.com/owner/repo"
        disabled={isBusy || isSubmitting}
        className="flex-1 rounded-lg border border-border-subtle bg-background/60 px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-dark focus:border-accent/50 focus:outline-none disabled:opacity-50"
      />
      {!isBusy ? (
        <button
          type="submit"
          disabled={isSubmitting || !value.trim()}
          className="shrink-0 rounded-lg bg-accent px-6 py-2.5 font-display text-sm font-semibold text-background shadow-glow-accent transition-opacity hover:shadow-glow-lg disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting…' : submitLabel}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="shrink-0 rounded-lg border border-border-subtle px-6 py-2.5 font-mono text-sm text-muted-dark"
        >
          {busyLabel}
        </button>
      )}
    </form>
  )
}
