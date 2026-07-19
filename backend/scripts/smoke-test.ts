/**
 * Full-system end-to-end smoke test.
 *
 * Exercises the REAL running system over HTTP exactly like the frontend does:
 *   register a user -> POST a job -> poll until it reaches a terminal status
 *   -> fetch the structured report and the job's log trace.
 *
 * If no server is already listening on the target URL (and it's localhost),
 * this script starts one for you (tsx src/index.ts), waits for /health, runs
 * the flow, then shuts it down. So a single command tests the whole stack:
 *   Express API + auth + job queue + Docker sandbox + (optional) AI fix loop.
 *
 * Usage (from the backend/ folder):
 *   npm run smoke                      # default repo (python hello-world, needs no AI key)
 *   npm run smoke -- <github repo url> # test a specific repo
 *
 * Env overrides:
 *   SMOKE_BASE_URL          default http://localhost:3000
 *   SMOKE_REPO              default https://github.com/Azure-Samples/python-docs-hello-world
 *   SMOKE_JOB_TIMEOUT_MS    default 720000 (12 min)
 *
 * Prerequisites: Docker must be running. For the AI fix loop to actually run,
 * set OPENAI_API_KEY in backend/.env (see .env.example). Without a key the
 * pipeline still clones/installs/runs — it just can't AI-fix broken repos.
 */

import 'dotenv/config';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const REPO_URL = process.argv[2] ?? process.env.SMOKE_REPO ?? 'https://github.com/Azure-Samples/python-docs-hello-world';
const JOB_TIMEOUT_MS = Number(process.env.SMOKE_JOB_TIMEOUT_MS ?? 12 * 60_000);
const HEALTH_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;

const TERMINAL = new Set([
  'succeeded',
  'failed',
  'failed_unfixable',
  'unsupported_stack',
  'invalid_manifest',
  'conflicting_manifests',
  'engine_version_mismatch',
]);

const BACKEND_DIR = path.resolve(__dirname, '..');
const SERVER_LOG = path.join(__dirname, 'smoke-server.log');

function log(msg: string): void {
  console.log(`[smoke] ${msg}`);
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let nextHeartbeat = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    if (Date.now() > nextHeartbeat) {
      log('  ...waiting for server to become healthy');
      nextHeartbeat = Date.now() + 5_000;
    }
    await sleep(500);
  }
  return false;
}

function startServer(port: string): ChildProcess {
  const fd = fs.openSync(SERVER_LOG, 'w');
  // Launch tsx directly via node (--import tsx) — no npx/shell, so it starts
  // fast and there's no grandchild process to chase down on cleanup.
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: port },
    stdio: ['ignore', fd, fd],
  });
  return child;
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

interface ApiOpts {
  method?: string;
  token?: string;
  body?: unknown;
}

async function api<T = any>(pathname: string, opts: ApiOpts = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${pathname} -> ${res.status}: ${text}`);
  }
  return data as T;
}

async function main(): Promise<number> {
  log(`target:  ${BASE_URL}`);
  log(`repo:    ${REPO_URL}`);
  if (!process.env.OPENAI_API_KEY) {
    log('WARNING: OPENAI_API_KEY is not set — the AI diagnose/fix/reflect steps will fall back.');
    log('         Repos needing a code fix will end "failed"; add a key in backend/.env to test the AI loop.');
  }

  // 1) Make sure a server is reachable (start one if it's local and down).
  let server: ChildProcess | null = null;
  if (!(await isHealthy())) {
    const url = new URL(BASE_URL);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (!isLocal) {
      log(`no server reachable at ${BASE_URL} and it is not localhost — start it yourself, then re-run.`);
      return 1;
    }
    const port = url.port || '3000';
    log(`no server running — starting one (logs -> ${path.relative(process.cwd(), SERVER_LOG)})`);
    server = startServer(port);
    if (!(await waitForHealth(HEALTH_TIMEOUT_MS))) {
      log('server did not become healthy in time. Last server log lines:');
      try {
        console.log(fs.readFileSync(SERVER_LOG, 'utf8').split('\n').slice(-20).join('\n'));
      } catch {
        /* ignore */
      }
      if (server) killTree(server);
      return 1;
    }
    log('server is up.');
  } else {
    log('using the already-running server.');
  }

  try {
    // 2) Register a fresh throwaway user and grab a token.
    const email = `smoke-${Date.now()}@example.com`;
    const { token } = await api<{ token: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'smoke-password-123' },
    });
    log(`registered ${email}`);

    // 3) Create the job.
    const created = await api<{ id: string; status: string }>('/api/jobs', {
      method: 'POST',
      token,
      body: { repoUrl: REPO_URL },
    });
    log(`job created: ${created.id} (status ${created.status})`);

    // 4) Poll until terminal or timeout.
    const deadline = Date.now() + JOB_TIMEOUT_MS;
    let job: any = created;
    let lastStatus = '';
    while (Date.now() < deadline) {
      job = await api(`/api/jobs/${created.id}`, { token });
      if (job.status !== lastStatus) {
        log(`status -> ${job.status} (attempts so far: ${job.attempts?.length ?? 0})`);
        lastStatus = job.status;
      }
      if (TERMINAL.has(job.status)) break;
      await sleep(POLL_INTERVAL_MS);
    }

    if (!TERMINAL.has(job.status)) {
      log(`TIMEOUT: job did not finish within ${JOB_TIMEOUT_MS}ms (last status: ${job.status}).`);
      return 1;
    }

    // 5) Pull the structured report and log trace, just like the UI would.
    const report = await api(`/api/jobs/${created.id}/report`, { token });
    const logs = await api<{ events: unknown[] }>(`/api/jobs/${created.id}/logs`, { token });

    console.log('');
    log('================ RESULT ================');
    log(`final status : ${job.status}`);
    log(`attempts used: ${job.attempts?.length ?? 0}`);
    log(`log events   : ${logs.events?.length ?? 0}`);
    if (job.stack) log(`stack        : ${job.stack.language} / ${job.stack.packageManager ?? 'n/a'}`);
    if (report?.outcome) log(`outcome      : ${report.outcome}`);
    if (job.error) log(`error        : ${String(job.error).split('\n')[0]}`);
    if (job.hasResult) log(`download     : GET ${BASE_URL}/api/jobs/${created.id}/download`);
    log('========================================');

    const green = job.status === 'succeeded';
    log(green ? 'PASS: the app was revived and is runnable.' : `DONE: system reached terminal status "${job.status}" (not a crash — this is a real classification).`);
    // The smoke test verifies the whole flow works, so any terminal status is a
    // successful test run. We surface the classification but exit 0.
    return 0;
  } finally {
    if (server) {
      log('shutting down the server it started.');
      killTree(server);
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[smoke] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
