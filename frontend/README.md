# RepoRevive Frontend

React 19 + Vite app: the marketing landing page, auth pages, and the dashboard where jobs actually run.
See the [root README](../README.md) for the full project overview.

## Setup

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, expects the backend on http://localhost:3000
```

Set `VITE_API_URL` in `.env` if the backend runs somewhere other than `localhost:3000`.

## Structure

```
src/
├── pages/          # LandingPage, LoginPage, RegisterPage, DashboardPage
├── components/      # ReviveWidget (job runner), JobHistoryList, DashboardStats,
│                     # Hero + landing sections, shared UI (TerminalShell, RepoUrlForm)
├── context/          # AuthContext — token/user in localStorage
├── hooks/            # useJobPolling, useJobsList
└── lib/              # api client, job status labels, pending-repo sessionStorage handoff
```

## Notable behavior

- Pasting a repo URL on the landing page while logged out saves it to `sessionStorage` and redirects to
  `/login`; signing in (or registering) picks it back up and revives it automatically on the dashboard.
- The dashboard polls job status every ~1.5s and job history every ~3s — no websockets, just plain
  polling, which is enough for a single-job-at-a-time demo tool.
