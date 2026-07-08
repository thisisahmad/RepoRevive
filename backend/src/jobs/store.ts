import { randomUUID } from 'crypto';
import { db } from '../db';
import { Attempt, Job } from '../types';

interface JobRow {
  id: string;
  userId: string | null;
  repoUrl: string;
  status: string;
  stack: string | null;
  attempts: string;
  error: string | null;
  createdAt: string;
  resultZipPath: string | null;
  reportPath: string | null;
}

function rowToJob(row: JobRow): Job {
  return {
    ...row,
    status: row.status as Job['status'],
    stack: row.stack ? JSON.parse(row.stack) : null,
    attempts: JSON.parse(row.attempts),
  };
}

export function createJob(repoUrl: string, userId: string | null): Job {
  const job: Job = {
    id: randomUUID(),
    userId,
    repoUrl,
    status: 'queued',
    stack: null,
    attempts: [],
    error: null,
    createdAt: new Date().toISOString(),
    resultZipPath: null,
    reportPath: null,
  };
  db.prepare(
    `INSERT INTO jobs (id, userId, repoUrl, status, stack, attempts, error, createdAt, resultZipPath, reportPath)
     VALUES (@id, @userId, @repoUrl, @status, @stack, @attempts, @error, @createdAt, @resultZipPath, @reportPath)`
  ).run({ ...job, stack: null, attempts: '[]' });
  return job;
}

export function getJob(id: string): Job | null {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

type JobPatch = Partial<Pick<Job, 'status' | 'stack' | 'attempts' | 'error' | 'resultZipPath' | 'reportPath'>>;

export function updateJob(id: string, patch: JobPatch): void {
  const cols: string[] = [];
  const vals: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(patch)) {
    cols.push(`${key} = @${key}`);
    vals[key] = key === 'stack' || key === 'attempts' ? JSON.stringify(value) : value;
  }
  if (cols.length === 0) return;
  db.prepare(`UPDATE jobs SET ${cols.join(', ')} WHERE id = @id`).run(vals);
}

export function appendAttempt(id: string, attempt: Attempt): void {
  const job = getJob(id);
  if (!job) return;
  updateJob(id, { attempts: [...job.attempts, attempt] });
}

export function listJobsByUser(userId: string): Job[] {
  const rows = db
    .prepare('SELECT * FROM jobs WHERE userId = ? ORDER BY createdAt DESC')
    .all(userId) as JobRow[];
  return rows.map(rowToJob);
}
