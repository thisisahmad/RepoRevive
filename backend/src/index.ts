import fs from 'fs';
import { createApp } from './app';
import { config, resultsDir } from './config';
import './db'; // initializes SQLite + schema

fs.mkdirSync(resultsDir, { recursive: true });

const app = createApp();
app.listen(config.port, () => {
  console.log(`RepoRevive backend listening on http://localhost:${config.port}`);
});
