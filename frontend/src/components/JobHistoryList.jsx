import { STATUS_META } from '../lib/jobStatus'
import TerminalShell from './ui/TerminalShell'

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function JobHistoryList({ jobs, isLoading }) {
  return (
    <TerminalShell title="reporevive --history">
      {jobs.length === 0 ? (
        <p className="p-6 text-center font-mono text-sm text-muted-dark">
          {isLoading ? 'Loading…' : 'No jobs yet — paste a repo above to get started.'}
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-border-subtle overflow-y-auto">
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] ?? STATUS_META.queued
            return (
              <li key={job.id} className="flex items-center gap-4 px-6 py-4">
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-foreground">{job.repoUrl}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-dark">
                    {formatDate(job.createdAt)}
                    {job.stack?.language && ` · ${job.stack.language}`}
                  </p>
                </div>
                <span className={`shrink-0 font-mono text-xs ${meta.color}`}>{meta.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </TerminalShell>
  )
}
