# LocalAI Email Cleaner Setup

## 1. Install and Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173.

For seeded demo accounts, emails, schedules, and labels, set this before the first run:

```bash
$env:LOCALAI_TEST_DATA="true"
npm run dev
```

Without `LOCALAI_TEST_DATA=true`, new local state starts empty.

Optional limits for larger inboxes:

```bash
$env:LOCALAI_GMAIL_SYNC_LIMIT="500"
$env:LOCALAI_GMAIL_PAGE_SIZE="100"
$env:LOCALAI_GMAIL_FETCH_CONCURRENCY="10"
```

`LOCALAI_GMAIL_SYNC_LIMIT` controls how many recent inbox messages are synced per active account. Cleanup sends one email per model request and marks each handled email as processed.

## 2. Google Cloud and Gmail API

Create a Google Cloud OAuth app:

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable **Gmail API**.
4. Configure the OAuth consent screen.
5. Create an **OAuth client ID** of type **Web application**.
6. Open that OAuth client under **Credentials** and add this value under **Authorized redirect URIs**:

```text
http://127.0.0.1:8787/api/gmail/oauth/callback
```

Do not put this value in **Authorized domains**. Authorized domains only accepts domains, not ports or paths.

7. In LocalAI Mail Settings, enter the Gmail address, OAuth client ID, and OAuth client secret.
   - The OAuth client ID normally ends with `.apps.googleusercontent.com`.
   - Do not use the numeric Google Cloud project ID.
8. Click **Connect Google**. Approve Gmail access in the Google consent screen.
9. The app stores the returned refresh token on the active account.

Required Gmail scopes:

```text
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.labels
https://www.googleapis.com/auth/gmail.readonly
```

In the app, go to **Settings -> Google accounts**:

1. Click **Add account**.
2. Enter the Gmail address.
3. Paste the OAuth client ID, client secret, and refresh token.
4. Save settings, or click **Connect Google** which saves first.
5. Click **Sync Gmail inbox** after the refresh token appears.

The app stores multiple Google account records locally in `server/data/state.json`. Cleanup runs operate on the active account only.

## 3. OpenAI-Compatible Model

In **Settings -> OpenAI-compatible model**:

1. Enter a base URL such as `https://api.openai.com/v1` or a compatible local endpoint.
2. Enter an API key.
3. The app automatically calls the configured `/v1/models` endpoint after the URL/key/model fields change.
4. Click a discovered model or type one manually.

Classification uses the official `openai` client with `baseURL`, so OpenAI-compatible servers work as long as they implement chat completions and models listing.

## 4. WebClaw and Playwright

In Settings:

1. Enter the MCP stdio command, args, and optional working directory for the WebClaw MCP server.
2. Leave **Enable stdio MCP tools** on.
3. Leave **Enable Playwright fallback** on.
4. Leave **Auto-register automation tools** on.
5. Click **Probe tools**.

The app starts the configured MCP server over stdio using the official MCP TypeScript SDK, calls `tools/list`, and registers discovered unsubscribe/browser tools. When an MCP unsubscribe tool is connected, unsubscribe runs prefer it. If it is not connected and Playwright is enabled, the app uses local Playwright automation. Dry run mode records the intended unsubscribe without submitting pages.

## 5. Local SQL and AI Tools

Emails and cleanup decision history are stored in SQLite:

```text
server/data/localai-email-cleaner.sqlite
```

The AI gets a local tool named `query_email_decision_history`. During classification it can query prior decisions by account, sender, subject, and limit. This helps keep future cleanup decisions consistent with past behavior.

You can inspect the same history through:

```text
GET /api/decisions/history?sender=news@example.com&limit=10
```

## 6. Cleanup Flow

1. Sync the active Gmail account.
2. Go to **Dashboard**.
3. Click **Run cleanup**.
4. The AI classifies synced emails, applies labels, archives, trashes selected mail, and attempts unsubscribes according to Settings.
5. Deleted emails are backed up first under `server/data/deleted-email-backups`.
6. If an unsubscribe succeeds, all stored previous emails from that sender are deleted as part of the run. In dry-run mode this is only planned and logged.
7. Results appear in **History**.

Dry run is enabled by default. Turn it off only after Gmail sync, model probing, and tool probing all work.

## 7. Verification

```bash
npm run lint
npm run typecheck
npm run build
npm run e2e
npm audit --omit=dev
```
