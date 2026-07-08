# RepoRevive Backend

Node.js + Express + TypeScript API that takes a public GitHub repo URL, clones and runs it inside an isolated Docker container, auto-fixes failures with an AI agent loop (feature 4, upcoming), and produces a plain-English report with diffs.

## Requirements

- Node.js 20+
- Docker Desktop running (Linux containers)

## Setup

```bash
cd backend
npm install
copy .env.example .env   # then edit if needed
npm run dev
```

## Project structure

```
backend/
├── package.json
├── tsconfig.json
├── .env.example
├── storage/                  # created at runtime (gitignored)
│   ├── reporevive.db         # SQLite
│   └── results/<jobId>.zip   # feature 6
└── src/
    ├── index.ts              # entry point: init dirs/db, start server
    ├── app.ts                # express app wiring
    ├── config.ts             # env + tunables (timeouts, images, limits)
    ├── types.ts              # Job, Attempt, StackInfo, JobStatus
    ├── db/
    │   └── index.ts          # better-sqlite3 init + schema (users, jobs)
    ├── jobs/
    │   ├── routes.ts         # POST /api/jobs, GET /api/jobs/:id
    │   ├── store.ts          # job CRUD against SQLite
    │   ├── validate.ts       # strict public-github-URL validation
    │   └── runner.ts         # in-process async queue (returns 202 fast)
    ├── stack/
    │   └── detect.ts         # feature 2: Node/Python + pkg manager + entry point
    ├── sandbox/
    │   ├── docker.ts         # dockerode helpers: create/exec/destroy, limits
    │   └── pipeline.ts       # feature 3: clone → detect → install → run
    ├── ai/                   # feature 4: fix loop (read_file/write_file/run_command)
    ├── report/               # feature 5: JSON + markdown report rendering
    └── auth/                 # feature 7: register/login, JWT middleware
```

## API (so far)

| Method | Path | Description |
|---|---|---|
| POST | `/api/jobs` | `{ "repoUrl": "https://github.com/owner/repo" }` → `202 { id, status }` |
| GET | `/api/jobs/:id` | Poll status, detected stack, attempts, last error |
| GET | `/health` | Liveness check |

Job status flow: `queued → cloning → detecting → installing → running → succeeded | failed | unsupported_stack` (`fixing` arrives with feature 4).

## How a job runs (features 2 + 3)

1. **Detect pass** — a throwaway `alpine/git` container shallow-clones the repo to `/workspace/job-<uuid>` and the repo root is inspected: `package.json` → Node (npm/yarn/pnpm by lockfile), `requirements.txt`/`pyproject.toml` → Python (pip/poetry). Start command comes from `scripts.start`, falling back to `index.js`/`server.js`/`app.py`/`main.py` etc. Anything else → `unsupported_stack`.
2. **Run pass** — a fresh `node:20` or `python:3.12` container (1 GiB RAM, 1 CPU, pids limit, `no-new-privileges`, no host mounts) clones again, runs the install command, then the start command under `timeout 18`. Exit `124` (still alive after 18s, i.e. a server) or `0` (clean quick exit, i.e. a script) = success; anything else = failure with captured stderr.
3. Containers are always destroyed in `finally` — except (future) when handing off to the AI fix loop.

## Quick test

```bash
# should succeed (tiny Node repo) — first run pulls images, be patient
curl -s -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" -d "{\"repoUrl\":\"https://github.com/octocat/Hello-World\"}"

# poll it
curl -s http://localhost:3000/api/jobs/<id>

# validation rejects
curl -s -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" -d "{\"repoUrl\":\"https://gitlab.com/foo/bar\"}"
curl -s -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" -d "{\"repoUrl\":\"git@github.com:foo/bar.git\"}"
```

`octocat/Hello-World` has no manifest, so it exercises clone + detection and lands on `unsupported_stack`. For a full success path try any small Node repo with a `start` script, e.g. `https://github.com/heroku/node-js-sample`.
