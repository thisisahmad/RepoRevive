import Database from 'better-sqlite3';
import fs from 'fs';
import { config, dbPath } from '../config';

fs.mkdirSync(config.storageDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    createdAt    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    userId        TEXT,
    repoUrl       TEXT NOT NULL,
    status        TEXT NOT NULL,
    stack         TEXT,
    attempts      TEXT NOT NULL DEFAULT '[]',
    error         TEXT,
    createdAt     TEXT NOT NULL,
    resultZipPath TEXT,
    reportPath    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_userId ON jobs(userId);
`);
