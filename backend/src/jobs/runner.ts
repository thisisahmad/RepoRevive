import { config } from '../config';
import { processJob } from '../sandbox/pipeline';
import { getJob, updateJob } from './store';

/**
 * Minimal in-process queue: POST /api/jobs returns immediately and the
 * pipeline runs in the background, at most `maxConcurrentJobs` at a time.
 */
const queue: string[] = [];
let active = 0;

export function enqueueJob(jobId: string): void {
  queue.push(jobId);
  pump();
}

function pump(): void {
  while (active < config.maxConcurrentJobs && queue.length > 0) {
    const jobId = queue.shift()!;
    active++;
    processJob(jobId)
      .catch((err: unknown) => {
        console.error(`[job ${jobId}] pipeline crashed:`, err);
        const job = getJob(jobId);
        // Don't clobber a terminal status the pipeline already set.
        const terminal = [
          'succeeded',
          'failed',
          'failed_unfixable',
          'cancelled',
          'unsupported_stack',
          'invalid_manifest',
          'conflicting_manifests',
          'engine_version_mismatch',
        ];
        if (job && !terminal.includes(job.status)) {
          updateJob(jobId, {
            status: 'failed',
            error: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}
