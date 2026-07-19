# RepoRevive evaluation report

_Generated from the run at 2026-07-19T09:05:38.475Z (regenerated on every run)._

This run executed fixtures against a live Docker daemon.

## Results

| Fixture | Expected | Actual | Attempts | Time | Result |
| --- | --- | --- | --- | --- | --- |
| `heroku/node-js-sample` | fixable (node) | engine_version_mismatch (engine_version_mismatch) | 0 | 12.5s | FAIL |
| `heroku/node-js-getting-started` | fixable (node) | engine_version_mismatch (engine_version_mismatch) | 0 | 4.8s | FAIL |
| `Azure-Samples/python-docs-hello-world` | fixable (python) | fixable (succeeded) | 0 | 88.9s | PASS |
| `gothinkster/node-express-realworld-example-app` | unfixable (node) | unsupported (unsupported_stack) | 0 | 2.8s | FAIL |
| `openai/openai-quickstart-node` | unfixable (node) | failed (failed) | 5 | 20.6s | FAIL |
| `vitejs/vite` | unsupported (node) | error (cloning) | 0 | 120.0s | FAIL |
| `golang/example` | unsupported (none) | unsupported (unsupported_stack) | 0 | 2.5s | PASS |
| `Marak/badproject` | invalid_manifest (node) | invalid_manifest (invalid_manifest) | 0 | 2.1s | PASS |

## Aggregate metrics

- **Fixtures:** 8
- **Passed (actual == expected):** 3/8 (38%)
- **Overall fix rate (ended up running):** 13%
- **Fix rate among repos expected fixable:** 33%
- **Avg attempts per successful fix:** 0.00
- **Avg time per job:** 31.8s
- **Reflection stopped early on expected-unfixable repos:** 0%
- **Low-confidence diagnoses:** 1 job(s) had one — 0 later succeeded, 1 did not.

## Manual review (diagnosis reasonableness)

The `diagnosisReasonable` field in the JSON is intentionally left `null` — it is an eyeballed judgement to fill in after reviewing each job's diagnosis categories against its error. Categories observed per fixture:

- `heroku/node-js-sample`: (no fix attempts)
- `heroku/node-js-getting-started`: (no fix attempts)
- `Azure-Samples/python-docs-hello-world`: (no fix attempts)
- `gothinkster/node-express-realworld-example-app`: (no fix attempts)
- `openai/openai-quickstart-node`: unknown, unknown, unknown, unknown, unknown
- `vitejs/vite`: (no fix attempts)
- `golang/example`: (no fix attempts)
- `Marak/badproject`: (no fix attempts)

## Notes on each fixture

- `heroku/node-js-sample` — Minimal Express app; expected to install and run cleanly on the first try (this is the project's own smoke-test repo). Baseline for the happy path.
  - error: package.json requires Node "4.0.0" (engines.node), but the build image provides Node 20.x.
- `heroku/node-js-getting-started` — Slightly larger Express getting-started app with a scripts.start; expected to install and stay alive under the run timeout (counts as running).
  - error: package.json requires Node "22.x || 24.x || 26.x" (engines.node), but the build image provides Node 20.x.
- `Azure-Samples/python-docs-hello-world` — Tiny Flask sample with app.py + requirements.txt. `python app.py` imports Flask and exits cleanly (exit 0 = success in the pipeline), so it should count as fixable/runnable.
- `gothinkster/node-express-realworld-example-app` — RealWorld API server that connects to a database/URI at boot which won't exist in the sandbox. No code-only fix can conjure a database, so reflection should conclude it's unfixable and stop early (failed_unfixable) rather than burn all 5 attempts.
  - error: This looks like a monorepo (npm/yarn/pnpm workspaces, Lerna, or Nx detected). Full monorepo support is out of scope for this MVP — only single-package Node repos are supported.
- `openai/openai-quickstart-node` — Requires an OPENAI_API_KEY that will never be present. Included to check that reflection recognizes a secret/paid-dependency failure as unfixable instead of looping. (If the dev server boots and stays alive without hitting the API, this may instead read as fixable - exactly the kind of thing the eval surfaces.)
  - error: App crashed (exit 1) running "node index.js":
node:internal/modules/cjs/loader:1210
  throw err;
  ^

Error: Cannot find module '/workspace/job-6886d4f8-cb4c-4d5c-b30d-ba9d4c36d718/index.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1207:15)
    at Module._load (node:internal/modules/cjs/loader:1038:27)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:164:12)
    at node:internal/main/run_main_module:28:49 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v20.20.2
- `vitejs/vite` — A pnpm/workspaces monorepo. Detection should reject it as an unsupported_variant -> unsupported_stack with a specific reason, not attempt an install (from the project's quick-test list).
  - error: fixture exceeded 120000ms; last status "cloning"
- `golang/example` — A Go repo with no package.json/requirements.txt/pyproject.toml. Should be classified 'not_found' -> unsupported_stack, exercising the unsupported-language path.
  - error: No package.json, requirements.txt, or pyproject.toml found in the repo root. Only Node and Python projects are supported in this MVP.
- `Marak/badproject` — A repo that exists specifically because its package.json is intentionally malformed (not valid JSON). Exercises the Part B pre-flight validation: should stop with status invalid_manifest BEFORE install and before the AI fix loop is ever given the broken input.
  - error: package.json exists but is not valid JSON.
