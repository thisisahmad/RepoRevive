import fs from 'fs';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { buildReport } from '../report/build';
import { renderReportMarkdown } from '../report/markdown';
import { Job } from '../types';
import { enqueueJob } from './runner';
import { createJob, getJob, listJobsByUser } from './store';
import { validateGithubUrl } from './validate';

const router = Router();
router.use(requireAuth);

/** Strip host paths from the API response. */
function toPublicJob(job: Job) {
  const { resultZipPath, reportPath, ...rest } = job;
  return { ...rest, hasResult: resultZipPath !== null };
}

/** repoUrl is normalized to https://github.com/<owner>/<repo>.git — pull out <repo>. */
function repoNameFromUrl(repoUrl: string): string {
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/);
  return match ? match[1] : 'repo';
}

// POST /api/jobs  { repoUrl } -> 202 { id, status }
router.post('/', (req, res) => {
  const result = validateGithubUrl(req.body?.repoUrl);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }
  const job = createJob(result.value.normalizedUrl, req.userId!);
  enqueueJob(job.id);
  return res.status(202).json({ id: job.id, status: job.status });
});

// GET /api/jobs -> the current user's job history, newest first
router.get('/', (req, res) => {
  const jobs = listJobsByUser(req.userId!);
  return res.json(jobs.map(toPublicJob));
});

// GET /api/jobs/:id -> poll status + attempts so far (owner only)
router.get('/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ error: 'job not found' });
  }
  return res.json(toPublicJob(job));
});

// GET /api/jobs/:id/download -> streams the result zip (owner only)
router.get('/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ error: 'job not found' });
  }
  if (!job.resultZipPath || !fs.existsSync(job.resultZipPath)) {
    return res.status(404).json({ error: 'no result available for this job' });
  }
  return res.download(job.resultZipPath, `reporevive-${repoNameFromUrl(job.repoUrl)}.zip`);
});

// GET /api/jobs/:id/report -> structured JSON report (owner only)
router.get('/:id/report', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ error: 'job not found' });
  }
  return res.json(buildReport(job));
});

// GET /api/jobs/:id/report.md -> same content as downloadable markdown (owner only)
router.get('/:id/report.md', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.userId !== req.userId) {
    return res.status(404).json({ error: 'job not found' });
  }
  const markdown = renderReportMarkdown(buildReport(job));
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporevive-report-${repoNameFromUrl(job.repoUrl)}.md"`);
  return res.send(markdown);
});

export default router;
