import fs from 'fs';
import path from 'path';
import { logsDir } from '../config';

/**
 * Lightweight structured JSON logger — no external dependency.
 *
 * Every meaningful step in a job's lifecycle is recorded as one JSON line:
 *   { timestamp, jobId, eventType, data }
 * written to BOTH the console (local dev visibility) and a per-job file at
 * <storageDir>/logs/job-<jobId>.log, so the full reasoning/execution trace of
 * any single job can be reconstructed after the fact by reading one file.
 *
 * Large strings anywhere in `data` are truncated (with a note) so a single
 * event — e.g. a huge install error — can't bloat the log. Full file contents
 * are never logged; callers pass paths and error tails, not file bodies.
 */

const MAX_STRING_LEN = 2000;

export interface LogEntry {
  timestamp: string;
  jobId: string;
  eventType: string;
  data: Record<string, unknown>;
}

let dirReady = false;
function ensureDir(): void {
  if (dirReady) return;
  fs.mkdirSync(logsDir, { recursive: true });
  dirReady = true;
}

/** jobId is a server-generated UUID, but strip anything odd to be safe about paths. */
function logFilePath(jobId: string): string {
  const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(logsDir, `job-${safe}.log`);
}

/** Recursively truncate long strings so logs stay a reasonable size. */
function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length <= MAX_STRING_LEN) return value;
    return `${value.slice(0, MAX_STRING_LEN)}…(truncated ${value.length - MAX_STRING_LEN} chars)`;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) out[key] = sanitize(val);
    return out;
  }
  return value;
}

/**
 * Write one structured log event for a job. Never throws — logging must not be
 * able to break the pipeline, so file-write failures are swallowed (after a
 * warning) rather than propagated.
 */
export function logEvent(jobId: string, eventType: string, data: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    jobId,
    eventType,
    data: sanitize(data) as Record<string, unknown>,
  };
  const line = JSON.stringify(entry);

  console.log(line);

  try {
    ensureDir();
    fs.appendFileSync(logFilePath(jobId), `${line}\n`);
  } catch (err) {
    console.warn(`[logger] failed to write log file for job ${jobId}:`, err instanceof Error ? err.message : err);
  }
}

/** Read a job's structured log back as an array of entries (for the API). */
export function readJobLog(jobId: string): LogEntry[] {
  try {
    const content = fs.readFileSync(logFilePath(jobId), 'utf8');
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LogEntry);
  } catch {
    // No file yet (job hasn't logged anything) or unreadable — empty trace.
    return [];
  }
}
