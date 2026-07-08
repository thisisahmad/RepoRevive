import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
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

export default router;
