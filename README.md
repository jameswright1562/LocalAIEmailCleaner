# LocalAI Email Cleaner

React + Node/TypeScript web app for AI-assisted Gmail inbox cleanup.

## Run

```bash
npm install
npm run dev
```

Frontend: http://127.0.0.1:5173  
Backend API: http://127.0.0.1:8787

## Local infrastructure

```bash
docker compose up
```

If you use Podman, start its machine first and run the same Compose stack with:

```bash
podman machine start
podman compose up
```

This starts PostgreSQL on `127.0.0.1:5432`, LocalStack SQS on `127.0.0.1:4566`,
and runs Terraform once to create the local email cleanup queue plus its DLQ.
LocalStack uses the GitHub-backed `gresau/localstack-persist` image, with
persisted resources stored in the `localstack_persisted_data` volume.

On Windows, Podman requires a working WSL2 machine. If `podman machine start`
reports `HCS_E_HYPERV_NOT_INSTALLED`, enable the Windows **Virtual Machine
Platform** optional component from an elevated terminal and reboot:

```powershell
wsl.exe --install --no-distribution
```

Connection defaults:

```text
DATABASE_URL=postgres://localai:localai@127.0.0.1:5432/localai_email_cleaner
AWS_ENDPOINT_URL=http://127.0.0.1:4566
AWS_REGION=eu-west-2
EMAIL_CLEANUP_QUEUE_NAME=localai-email-cleanup
EMAIL_CLEANUP_DLQ_NAME=localai-email-cleanup-dlq
```

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

These defaults let the app sync hundreds of emails. Cleanup classifies emails in batches (configurable via `LOCALAI_CLASSIFY_BATCH_SIZE`, default 20) and marks each handled email as processed so future runs skip it.

Optional scheduler and storage controls:

```bash
LOCALAI_SCHEDULER_INTERVAL_MS=60000
LOCALAI_MAX_RUNS=200
LOCALAI_CLIENT_URL=http://127.0.0.1:5173
```

Enabled schedules are evaluated by a background scheduler that runs due cleanups and advances `nextRunAt`.

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
npm run generate:types
npm run typecheck
npm run build
npm run e2e
npm audit --omit=dev
```

Shared API/UI types are authored in `server/src/types.ts`; `client/src/types.ts` is generated from that file.

Full end-to-end setup is documented in [SETUP.md](./SETUP.md).
