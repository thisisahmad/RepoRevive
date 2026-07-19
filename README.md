<div align="center">

<img src="docs/logo/reporevive-lockup.png" alt="RepoRevive" width="320">

**Paste a broken GitHub repo. Get back a diagnosis, an AI-attempted fix, and a working zip — or a clear explanation of why it couldn't be saved.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-required-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-412991?style=flat&logo=openai&logoColor=white)](https://platform.openai.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat)](LICENSE)

</div>

<br>

<p align="center">
  <img src="docs/screenshots/hero.png" alt="RepoRevive landing page" width="100%">
</p>

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Guardrails](#guardrails)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Job lifecycle](#job-lifecycle)
- [Evals](#evals)
- [Known limitations](#known-limitations)
- [Out of scope](#out-of-scope-by-design)
- [License](#license)

---

## What it does

You paste a link to a public GitHub repo. RepoRevive clones it into an isolated Docker container,
figures out whether it's a Node or Python project, and tries to install and run it. If that fails, it
asks an LLM to **diagnose** why, then runs a bounded **fix loop** that edits files and re-tests inside
the container. Every job ends in one of two honest outcomes:

- a **downloadable zip** of the repaired project (if it ended up running), or
- a **plain-English report** of what broke, what was tried, and why it couldn't be fixed.

The whole thing is a straight-line pipeline, not a swarm of autonomous agents — each stage is a real
module under `backend/src`, and the LLM's only powers are three explicit tools scoped to one container.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="RepoRevive dashboard — job running, stats, and history" width="100%">
</p>

## Architecture

A job flows through these stages in order. Each maps to real code — there are no hidden "agents".

1. **Intake** (`jobs/validate.ts`, `jobs/routes.ts`, `jobs/runner.ts`) — the URL is validated as a
   well-formed `github.com/<owner>/<repo>` link (SSH URLs, embedded credentials, and non-GitHub hosts
   are rejected). A job row is created, `202` is returned immediately, and a small in-process queue
   picks it up so the API never blocks on a clone.
2. **Clone + stack detection** (`sandbox/pipeline.ts` → `stack/detect.ts`) — a throwaway `alpine/git`
   container shallow-clones the repo, and the root is inspected: `package.json` → Node (npm / yarn /
   pnpm by lockfile), `requirements.txt` / `pyproject.toml` → Python (pip or Poetry). Monorepos
   (workspaces / Lerna / Nx) and Pipenv repos are recognized and reported with a specific reason
   rather than a generic failure; a repo with no supported manifest ends as `unsupported_stack`.
3. **Structural validation** (`validateRepoInputs()` in `pipeline.ts`) — before anything is installed,
   the manifests are checked for structural problems and the pipeline stops early with a specific
   status if it finds one (see [Guardrails](#guardrails)).
4. **Sandboxed install + run** (`sandbox/pipeline.ts` → `sandbox/docker.ts`) — a fresh `node:20` or
   `python:3.12` container clones the repo again, installs dependencies, and runs the detected start
   command under a short run timeout. A server still alive when the timer fires (`exit 124`) or a
   script that exits cleanly (`exit 0`) both count as **running**.
5. **Diagnosis** (`ai/diagnose.ts`) — on an install/run failure, the error log + manifest are sent to
   the model, which classifies the failure into one of a fixed set of categories and returns a
   `confidence` score plus a list of unverified `assumptions`. A low-confidence diagnosis
   (below `0.4`) still proceeds to the fix loop but is flagged so the report shows a guess as a guess.
   For package failures a follow-up call (`ai/upgradeSuggest.ts`) may propose a specific upgrade path.
6. **Fix loop with reflection** (`ai/fixLoop.ts` + `ai/reflect.ts`, driven by `attemptFix()` in
   `pipeline.ts`) — the diagnosis feeds a tool-calling attempt limited to three tools
   (`read_file`, `write_file`, `run_command`). After each attempt the container is re-installed and
   re-run, then `reflectOnAttempt()` reasons about *why* the change didn't work and what to try next;
   that reflection is injected into the next attempt's prompt, so retries are informed, not blind.
7. **Report + delivery** (`report/build.ts`, `report/markdown.ts`) — on success the workspace is zipped
   inside the container and copied out for download. Either way, the full attempt history, diagnoses,
   reflections, and diffs are available as JSON or Markdown, and a structured event log is written per
   job.

```
 paste a repo URL
        │
        ▼
┌────────────────────┐   git clone --depth 1     ┌──────────────────────────┐
│  detect container  │ ─────────────────────────▶│  alpine/git (throwaway)  │
│  clone + detect +  │◀────────────────────────── │  read + validate         │
│  manifest validate │   stack / structural check │  package.json / etc.     │
└─────────┬──────────┘                            └──────────────────────────┘
          │  ok
          ▼
┌───────────────────────────────────────────────────────────────────┐
│  run container — node:20 or python:3.12                            │
│  no host mounts · 1 GiB RAM · 1 CPU · 256 pids · no-new-privileges │
│                                                                     │
│   clone → install → run  ── running ───────────────────────────┐  │
│      │                                                           │  │
│      └── fails ─▶ diagnose (AI) ─▶ fix attempt (3 tools)        │  │
│                        │                    │                    │  │
│                        │      reinstall + rerun + reflect        │  │
│                        │                    │                    │  │
│              reflection says stop? ─ yes ─▶ failed_unfixable     │  │
│                        │ no                                       │  │
│                        └── retry, up to 5 attempts total ────────┘  │
└───────────────────────────────────────────────────────────────────┘
          │                                   │
   running │                           still broken
          ▼                                   ▼
   zip + copy out                     failed / failed_unfixable
   GET /jobs/:id/download             GET /jobs/:id/report(.md)
```

## Guardrails

- **Docker isolation.** The repo is cloned *inside* the container — never onto the host — and no host
  volume is mounted. Each job uses a throwaway `alpine/git` container for detection and a fresh
  `node:20`/`python:3.12` container for the run, and **both are destroyed in a `finally` block** when
  the job ends, pass or fail.
- **Resource limits.** Every container is capped at **1 GiB memory** (swap pinned equal to memory, so
  no swap), **1 CPU**, a **256-process limit**, and runs with `no-new-privileges` (see
  `sandbox/docker.ts`).
- **The LLM cannot touch the host or the server.** Its only actions are three named tools —
  `read_file`, `write_file`, `run_command`. `run_command` *does* run shell, but only inside the
  disposable container, never on the host. Paths are confined to the job's workdir (`pipeline.ts`
  strips absolute paths and `../` traversal), and file contents are base64-encoded before being
  written so AI-authored text never needs shell-escaping.
- **5-attempt hard cap.** The fix loop runs at most `config.ai.maxFixAttempts` (5) attempts. Diagnosis
  and reflection are per-attempt sub-steps and do **not** count against the cap.
- **Reflection can stop early.** If reflection concludes the failure isn't fixable within this approach
  (e.g. it needs a paid API key or an external service), the loop stops before exhausting all 5
  attempts and the job is marked `failed_unfixable` rather than burning the remaining tries.
- **Structural manifest problems stop the pipeline before the AI runs.** `validateRepoInputs()` catches
  broken input up front and ends the job with a specific status — `invalid_manifest` (package.json
  isn't valid JSON / pyproject.toml isn't valid TOML), `conflicting_manifests` (requirements.txt and
  pyproject.toml pin the same package to different versions), or `engine_version_mismatch`
  (`engines.node` can't be satisfied by the build image). These are structural issues the fix loop's
  tools shouldn't be turned loose on. (A Node repo with no lockfile is *not* fatal — it's recorded as
  `stack.noLockfile` and surfaced in the report.)
- **Ownership checks.** Every `/api/jobs/*` route requires a JWT and checks `job.userId === req.userId`,
  returning `404` (not `403`) on a mismatch so job existence isn't leaked across users.

> **Note on network:** containers are **not** network-restricted — outbound access is required to
> `git clone` and to install packages from npm / PyPI. This is Docker-level isolation, not
> microVM-grade sandboxing; see [Known limitations](#known-limitations).

## Tech stack

| | |
|---|---|
| **Backend** | Node.js ≥20, Express 4, TypeScript, `dockerode`, OpenAI SDK, `better-sqlite3` (SQLite) |
| **Sandbox** | Docker — `alpine/git` for detection, `node:20` / `python:3.12` for execution |
| **Auth** | bcryptjs, jsonwebtoken |
| **Frontend** | React 19, React Router 7, Vite, Tailwind CSS, Framer Motion, Three.js (hero scene) |

## Project structure

```
reporevive/
├── backend/
│   └── src/
│       ├── index.ts, app.ts        # entry point + express wiring
│       ├── config.ts               # env vars, timeouts, image names, AI tunables
│       ├── types.ts                # Job, StackInfo, JobStatus
│       ├── db/                     # better-sqlite3 init + schema
│       ├── auth/                   # register/login, JWT middleware
│       ├── jobs/                   # routes, SQLite store, URL validation, in-process queue
│       ├── stack/detect.ts         # Node/Python stack detection
│       ├── sandbox/
│       │   ├── docker.ts           # dockerode helpers (create/exec/destroy, archive extraction)
│       │   └── pipeline.ts         # orchestrator — the only module touching both Docker and AI
│       ├── ai/
│       │   ├── client.ts           # OpenAI client singleton
│       │   ├── diagnose.ts         # failure classification (+ confidence, assumptions)
│       │   ├── upgradeSuggest.ts   # dependency upgrade suggestions
│       │   ├── fixLoop.ts          # tool-calling fix attempt (read_file/write_file/run_command)
│       │   ├── reflect.ts          # post-attempt reflection that steers the next attempt
│       │   ├── types.ts            # DiagnosisResult, Reflection, FixAttempt, ToolExecutors
│       │   └── prompts/            # one system prompt per AI call
│       ├── utils/logger.ts         # structured per-job JSON logging (console + storage/logs)
│       └── report/                 # JSON + Markdown report rendering
│
├── frontend/src/                   # React app (pages, components, hooks, api client)
├── evals/                          # evaluation harness — fixtures, runner, results, report
└── docs/screenshots/
```

## Getting started

### Prerequisites

- **Node.js 20+**
- **Docker Desktop**, running, with Linux containers
- An **OpenAI API key** — optional to boot the app, but the diagnosis/fix/reflect steps only do
  something real with a key set (without one they fall back gracefully; see
  [Known limitations](#known-limitations))

### Backend

```bash
cd backend
npm install
cp .env.example .env    # then set JWT_SECRET / OPENAI_API_KEY
npm run dev             # http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

Open `http://localhost:5173`, register an account, and paste a public repo. For a clean success path,
try `https://github.com/Azure-Samples/python-docs-hello-world` (a tiny Python app that installs and
runs as-is — verified by the eval harness).

### One-command tests

From `backend/`:

```bash
npm run smoke   # full end-to-end test over HTTP (auto-starts a server if none is running)
npm run eval    # runs the fixture set through the pipeline, writes evals/results + evals/report.md
```

## Environment variables

**`backend/.env`**

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API port |
| `JWT_SECRET` | `dev-secret-change-me` | Signing secret for auth tokens — change this in any real deployment |
| `OPENAI_API_KEY` | — | Needed for diagnosis / fix / reflection to actually classify and fix |
| `STORAGE_DIR` | `./storage` | Where the SQLite DB, result zips, and per-job logs live |
| `MAX_CONCURRENT_JOBS` | `2` | How many jobs the in-process queue runs at once |

**`frontend/.env`**

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Base URL the frontend calls |

## API reference

All `/api/jobs/*` routes require `Authorization: Bearer <token>` and are scoped to the requesting user.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | `{ email, password }` → `201 { token, user }` |
| `POST` | `/api/auth/login` | `{ email, password }` → `200 { token, user }` |
| `POST` | `/api/jobs` | `{ repoUrl }` → `202 { id, status }`, processed asynchronously |
| `GET` | `/api/jobs` | Current user's job history, newest first |
| `GET` | `/api/jobs/:id` | Poll status, detected stack, and attempts so far |
| `GET` | `/api/jobs/:id/download` | Streams the result zip (`succeeded` jobs only) |
| `GET` | `/api/jobs/:id/report` | Structured JSON report — diagnosis, reflections, diffs, outcome |
| `GET` | `/api/jobs/:id/report.md` | Same report as a downloadable Markdown file |
| `GET` | `/api/jobs/:id/logs` | Full structured log trace of the job (`{ jobId, events[] }`) |
| `GET` | `/health` | Liveness check |

## Job lifecycle

```
queued → cloning → detecting → installing → running
                                     │
                        running ─────┴───── failure
                           │                   │
                      succeeded          fixing ⇄ installing / running   (up to 5 attempts)
                                                 │
                             running ────────────┼──────── reflection: stop ──── exhausted
                                │                 │              │                    │
                           succeeded         (loop again)   failed_unfixable       failed

  structural / detection stops (no fix loop, no install attempt):
    no supported manifest / Pipenv / monorepo   → unsupported_stack
    manifest doesn't parse                       → invalid_manifest
    requirements.txt vs pyproject.toml disagree  → conflicting_manifests
    engines.node incompatible with node:20       → engine_version_mismatch
```

## Evals

`/evals/` is a small harness that runs a fixed set of known public repos through the **real** pipeline
and records how the system actually performs — success/failure comes from the job's own terminal
status, never from the model grading itself. Run it with `npm run eval` (from `backend/`); it writes a
timestamped JSON file to `evals/results/` and regenerates **[`evals/report.md`](evals/report.md)**.

In the last recorded run ([`evals/report.md`](evals/report.md)): **3 of 8** fixtures matched their
expected classification, and **1 of 8 (~13%)** ended up running. Important caveat — that run was
executed **without an `OPENAI_API_KEY`**, so the AI diagnose/fix/reflect steps fell back to their no-op
defaults. It therefore exercises the clone → detect → validate → install → run path and the structural
guards, but **not** the model-driven fixing (the one repo that ran needed no fix). Re-run with a key
set for numbers that reflect the fix loop. The failing fixtures are genuine findings, not harness bugs
(e.g. two Heroku samples pin an `engines.node` range incompatible with `node:20`).

## Known limitations

- **No `OPENAI_API_KEY`?** The app still runs, but diagnosis, fixing, and reflection all fall back to
  safe no-op defaults — failing jobs just cycle to a clean `failed` in a few seconds instead of being
  fixed.
- **Public repos only.** No private repos, no GitHub OAuth, no package-registry authentication.
- **Node and Python only.** Go is a stretch goal, not implemented — any other language ends as
  `unsupported_stack`.
- **No monorepo support.** Workspaces / Lerna / Nx / Pipenv repos are detected and reported clearly,
  but not built.
- **Docker-level isolation only.** Containers are resource-limited and host-isolated, but network is
  open (needed for clone/install) and this is not microVM-grade sandboxing.
- **Single-server execution.** SQLite + an in-process queue means one instance — there's no
  distributed queue or horizontal scaling.
- **The report diff isn't a reappliable patch.** It's a unified diff generated from before/after file
  snapshots for readability, not something meant for `git apply`.

## Out of scope (by design)

This is an MVP, not a hardened platform. Explicitly not built: private repos, GitHub OAuth, PR
auto-creation, batch/CI integration, languages beyond Node and Python, full monorepo/Pipenv builds,
and multi-instance/distributed execution.

## License

MIT — see [LICENSE](LICENSE).
