import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import authRouter from './auth/routes';
import jobsRouter from './jobs/routes';

export function createApp() {
  const app = express();
  // Demo tool, single trusted frontend — open CORS rather than an allowlist.
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/jobs', jobsRouter);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
