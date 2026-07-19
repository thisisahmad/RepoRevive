import 'dotenv/config';
import path from 'path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  storageDir: path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage')),
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS ?? 2),

  cloneTimeoutMs: 3 * 60_000,
  installTimeoutMs: 5 * 60_000,
  // If the start command survives this long, we consider the app "running" (success).
  runTimeoutSec: 18,

  images: {
    detect: 'alpine/git:latest', // tiny image used only to clone + inspect the repo root
    node: 'node:20',
    python: 'python:3.12',
  },

  ai: {
    model: 'gpt-4o-mini',
    maxFixAttempts: 5,
    maxToolRoundsPerAttempt: 8,
    // Below this diagnosis confidence we still run the fix loop, but flag the
    // attempt as low-confidence so the report doesn't present a guess as fact.
    lowConfidenceThreshold: 0.4,
  },
} as const;

export const resultsDir = path.join(config.storageDir, 'results');
export const dbPath = path.join(config.storageDir, 'reporevive.db');
export const logsDir = path.join(config.storageDir, 'logs');
