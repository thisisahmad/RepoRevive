# RepoRevive Backend

Node.js + Express + TypeScript API that clones a public GitHub repo into an isolated Docker container,
detects its stack, installs and runs it, diagnoses and attempts to fix failures with OpenAI, and
produces a downloadable result plus a plain-English report.

See the [root README](../README.md) for the full architecture, API reference, and feature list — this
file covers backend-specific setup and internals only.

## Requirements

- Node.js 20+
- Docker Desktop running (Linux containers)
- An OpenAI API key (optional — without one, the diagnosis/fix loop degrades gracefully to `unknown`
  and jobs still fail cleanly rather than hanging)

## Setup

```bash
cd backend
npm install
cp .env.example .env   # then edit JWT_SECRET / OPENAI_API_KEY
npm run dev
```

`npm run build && npm start` runs the compiled output instead of `tsx`.

## Project structure

```
backend/
├── package.json, tsconfig.json, .env.example
├── storage/                    # created at runtime (gitignored)
│   ├── reporevive.db           # SQLite — users, jobs
│   └── results/<jobId>.zip
└── src/
    ├── index.ts, app.ts        # entry point + express wiring
    ├── config.ts                # env vars, timeouts, image names, AI model/attempt caps
    ├── types.ts                 # Job, StackInfo, JobStatus
    ├── db/                      # better-sqlite3 init + schema
    ├── auth/                    # register/login, JWT middleware
    ├── jobs/
    │   ├── routes.ts            # POST /api/jobs, GET /:id, /:id/download, /:id/logs, /:id/report(.md)
    │   ├── store.ts             # job CRUD against SQLite
    │   ├── validate.ts          # strict public-github-URL validation
    │   └── runner.ts            # in-process async queue (returns 202 fast)
    ├── stack/
    │   └── detect.ts            # Node (npm/yarn/pnpm) + Python (pip/poetry) stack detection
    ├── sandbox/
    │   ├── docker.ts            # dockerode helpers: create/exec/destroy, archive extraction
    │   └── pipeline.ts          # orchestrator — clone → detect → install → run → diagnose+fix
    ├── ai/
    │   ├── client.ts            # OpenAI client singleton
    │   ├── diagnose.ts          # classifies why install/run failed
    │   ├── upgradeSuggest.ts    # suggests a specific dependency upgrade path
    │   ├── fixLoop.ts           # tool-calling fix attempt (read_file/write_file/run_command)
    │   ├── types.ts             # DiagnosisResult, SuggestedUpgrade, FixAttempt, ToolExecutors
    │   └── prompts/             # one exported constant per system prompt
    ├── utils/
    │   └── logger.ts            # structured per-job JSON logging (console + storage/logs/job-<id>.log)
    └── report/
        ├── build.ts             # shapes a Job into the report's JSON structure
        └── markdown.ts          # renders that structure as Markdown
```

Nothing under `src/ai/` imports `dockerode`. `pipeline.ts` builds a `ToolExecutors` object backed by
real `docker exec` calls and passes it in as a plain argument — that's the only place Docker and AI
calls meet.

## API

See the [root README's API reference](../README.md#api-reference) for the full table. All
`/api/jobs/*` routes require `Authorization: Bearer <token>` and are scoped to the requesting user.

## How a job runs

1. **Detect + validate** — a throwaway `alpine/git` container shallow-clones the repo and the root is
   inspected: `package.json` → Node, `requirements.txt`/`pyproject.toml` → Python. Monorepos and Pipenv
   repos are recognized and rejected with a specific message rather than attempted. Before anything is
   installed, `validateRepoInputs()` catches structural input problems and stops with a specific status —
   `invalid_manifest` (package.json isn't valid JSON / pyproject.toml isn't valid TOML),
   `conflicting_manifests` (requirements.txt and pyproject.toml pin the same package to different
   versions), or `engine_version_mismatch` (`engines.node` can't be satisfied by the build image). A
   Node repo with no lockfile isn't fatal — it's recorded as `stack.noLockfile` and surfaced in the report.
2. **Run** — a fresh `node:20` or `python:3.12` container (1 GiB RAM, 1 CPU, pids limit,
   `no-new-privileges`, no host mounts) installs, then runs the start command under a timeout. Still
   alive when the timer fires, or a clean quick exit — both count as success.
3. **On failure** — `diagnoseFailure()` classifies the error (deprecated package, breaking change,
   native build failure, missing env var, version mismatch, unknown) with a confidence score and a list
   of unverified assumptions; a diagnosis below the confidence threshold still runs but is flagged
   `lowConfidenceDiagnosis` so the report doesn't present a guess as fact. It optionally suggests a
   specific upgrade, then `runFixAttempt()` gets a bounded tool-calling session to fix it. Reinstall + rerun,
   then `reflectOnAttempt()` reasons about what happened — why the change didn't work and what to try
   next — and that reflection steers the next attempt's prompt so retries aren't blind. Repeat up to 5
   times; if reflection decides the failure isn't fixable within this approach (e.g. a missing paid API
   key) it stops early and marks the job `failed_unfixable` instead of burning the remaining attempts.
   Diagnosis and reflection are per-attempt steps, not attempts themselves — they don't count against the cap.
4. **On success** — the workspace is zipped inside the container (`apt-get install zip`, since neither
   base image ships it) and copied out via Docker's archive API before the container is destroyed.

## Quick test

```bash
# installs and runs cleanly (verified by the eval harness)
curl -s -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" -d "{\"repoUrl\":\"https://github.com/Azure-Samples/python-docs-hello-world\"}"

# a real monorepo — should report the specific reason, not a generic failure
curl -s -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" -d "{\"repoUrl\":\"https://github.com/vitejs/vite\"}"

# validation rejects non-GitHub / SSH URLs before a job is ever created
curl -s -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" -d "{\"repoUrl\":\"https://gitlab.com/foo/bar\"}"
```

You'll need a real account first — `POST /api/auth/register` — to get a token for these.
