# LocalAI Email Cleaner

React + Node/TypeScript web app for AI-assisted Gmail inbox cleanup.

## Run

```bash
npm install
npm run dev
```

Frontend: http://127.0.0.1:5173  
Backend API: http://127.0.0.1:8787

## Environment

Set this before first run if you want seeded demo accounts, demo messages, and a demo schedule:

```bash
LOCALAI_TEST_DATA=true
```

When `LOCALAI_TEST_DATA` is not `true`, new local state starts empty so real Google accounts can be added from Settings.

Optional scale controls:

```bash
LOCALAI_GMAIL_SYNC_LIMIT=500
LOCALAI_GMAIL_PAGE_SIZE=100
LOCALAI_GMAIL_FETCH_CONCURRENCY=10
```

These defaults let the app sync hundreds of emails. Cleanup sends emails to the model one at a time and marks each handled email as processed so future runs skip it.

## What is included

- Dashboard for AI cleanup review, labels, delete-with-backup, and unsubscribe recommendations.
- Settings page for Gmail OAuth details, OpenAI-compatible base URL/API key/model, MCP stdio command discovery, backups, auto-labeling, and dry-run mode.
- Multiple Google account records with an active account selector.
- Scheduled cleanup configuration page.
- Run history page with backup counts and unsubscribe counts.
- Full unsubscribe page that uses a WebClaw MCP endpoint when configured, then falls back to Playwright automation.
- Local JSON persistence under `server/data`.
- SQLite storage for emails and decision history under `server/data/localai-email-cleaner.sqlite`.

Dry run is enabled by default. Deleted-email backups are written before delete actions when deletion is enabled.

## Verification

```bash
npm run typecheck
npm run build
npm run e2e
npm audit --omit=dev
```

Full end-to-end setup is documented in [SETUP.md](./SETUP.md).
