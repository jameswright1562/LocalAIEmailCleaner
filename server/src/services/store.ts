import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AiDecision, AppState, CleanupRun, EmailRecord, GmailAccount, Schedule } from "../types.js";

const dataDir = path.resolve(process.cwd(), process.env.LOCALAI_DATA_DIR ?? "server/data");
const stateFile = path.join(dataDir, "state.json");
const sqliteFile = path.join(dataDir, "localai-email-cleaner.sqlite");
const testDataEnabled = process.env.LOCALAI_TEST_DATA === "true";
const maxStoredRuns = Math.max(1, Number(process.env.LOCALAI_MAX_RUNS ?? 200));

let db: DatabaseSync | undefined;
let initialized = false;

const testAccounts: GmailAccount[] = [
  { id: "gmail_primary", email: "james@example.com", clientId: "", clientSecret: "", refreshToken: "" },
  { id: "gmail_work", email: "work@example.com", clientId: "", clientSecret: "", refreshToken: "" }
];

const testEmails: EmailRecord[] = [
  {
    id: "msg_001",
    accountId: "gmail_primary",
    threadId: "thr_001",
    from: "jobs@greenhouse.io",
    subject: "Frontend Platform Engineer interview availability",
    snippet: "Thanks for applying. Pick a time this week and send your portfolio links.",
    receivedAt: "2026-06-17T08:12:00.000Z",
    labels: ["Job"],
    unsubscribeUrl: "https://example.com/unsubscribe/jobs",
    risk: "low"
  },
  {
    id: "msg_002",
    accountId: "gmail_primary",
    threadId: "thr_002",
    from: "deals@wanderly.test",
    subject: "Summer fares to Lisbon end tonight",
    snippet: "Your saved holiday alert has new flights under budget. Manage alerts or unsubscribe.",
    receivedAt: "2026-06-16T19:42:00.000Z",
    labels: ["Holiday", "Newsletter"],
    unsubscribeUrl: "https://example.com/unsubscribe/travel",
    risk: "medium"
  },
  {
    id: "msg_003",
    accountId: "gmail_work",
    threadId: "thr_003",
    from: "receipts@cloudhost.test",
    subject: "Receipt for invoice 4871",
    snippet: "Your monthly cloud hosting payment receipt and tax invoice are attached.",
    receivedAt: "2026-06-16T13:22:00.000Z",
    labels: ["Finance", "Receipt"],
    risk: "low"
  },
  {
    id: "msg_004",
    accountId: "gmail_work",
    threadId: "thr_004",
    from: "news@stackweekly.test",
    subject: "This week in local AI tooling",
    snippet: "New browser automation patterns, private inbox agents, and desktop LLM releases.",
    receivedAt: "2026-06-15T09:04:00.000Z",
    labels: ["Newsletter"],
    unsubscribeUrl: "https://example.com/unsubscribe/stackweekly",
    risk: "low"
  }
];

const testSchedules: Schedule[] = [
  {
    id: "sch_weekly",
    name: "Friday inbox reset",
    cadence: "weekly",
    time: "16:30",
    enabled: true,
    actions: { deleteLowConfidence: false, autoLabel: true, unsubscribeNewsletters: true },
    nextRunAt: "2026-06-19T16:30:00.000Z"
  }
];

const defaultAccounts = testDataEnabled ? testAccounts : [];

const defaultState: AppState = {
  settings: {
    activeGmailAccountId: defaultAccounts[0]?.id ?? "",
    gmailAccounts: defaultAccounts,
    openAiBaseUrl: "https://api.openai.com/v1",
    openAiApiKey: "",
    openAiModel: "gpt-4.1-mini",
    webclawMcpEndpoint: "",
    mcpStdioCommand: "",
    mcpStdioArgs: "",
    mcpStdioCwd: "",
    webclawEnabled: true,
    playwrightEnabled: true,
    autoRegisterAutomationTools: true,
    backupDeletedEmails: true,
    autoLabelEnabled: true,
    dryRun: true
  },
  automationTools: [],
  emails: testDataEnabled ? testEmails : [],
  decisions: [],
  runs: [],
  schedules: testDataEnabled ? testSchedules : []
};

type LegacySettings = Partial<AppState["settings"]> & {
  gmailAccount?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
};

type EmailRow = {
  id: string;
  account_id: string;
  thread_id: string;
  sender: string;
  subject: string;
  snippet: string;
  received_at: string;
  labels_json: string;
  unsubscribe_url: string | null;
  risk: EmailRecord["risk"];
  processed_at: string | null;
};

type DecisionRow = {
  email_id: string;
  action: AiDecision["action"];
  labels_json: string;
  confidence: number;
  reason: string;
  source: AiDecision["source"];
  unsubscribe_url: string | null;
};

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: CleanupRun["status"];
  mode: CleanupRun["mode"];
  scanned: number;
  deleted: number;
  archived: number;
  labeled: number;
  unsubscribed: number;
  backups_json: string;
  notes_json: string;
};

export type DecisionHistoryRow = {
  runId: string | null;
  emailId: string;
  accountId: string;
  sender: string;
  subject: string;
  action: string;
  labels: string[];
  confidence: number;
  reason: string;
  source: AiDecision["source"];
  unsubscribeUrl?: string;
  createdAt: string;
};

// Serializes all read-modify-write operations so concurrent requests cannot clobber each other.
let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(operation: () => Promise<T> | T): Promise<T> {
  const run = writeChain.then(operation, operation);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
}

function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(sqliteFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      subject TEXT NOT NULL,
      snippet TEXT NOT NULL,
      received_at TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      unsubscribe_url TEXT,
      risk TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS latest_decisions (
      email_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'heuristic',
      unsubscribe_url TEXT
    );

    CREATE TABLE IF NOT EXISTS decision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      email_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      subject TEXT NOT NULL,
      action TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'heuristic',
      unsubscribe_url TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_decision_history_lookup ON decision_history(account_id, sender, created_at);

    CREATE TABLE IF NOT EXISTS runs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      scanned INTEGER NOT NULL,
      deleted INTEGER NOT NULL,
      archived INTEGER NOT NULL,
      labeled INTEGER NOT NULL,
      unsubscribed INTEGER NOT NULL,
      backups_json TEXT NOT NULL,
      notes_json TEXT NOT NULL
    );
  `);
  ensureColumn(db, "emails", "processed_at", "TEXT");
  ensureColumn(db, "latest_decisions", "source", "TEXT NOT NULL DEFAULT 'heuristic'");
  ensureColumn(db, "decision_history", "source", "TEXT NOT NULL DEFAULT 'heuristic'");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_emails_account_sender ON emails(account_id, sender);
    CREATE INDEX IF NOT EXISTS idx_emails_account_processed ON emails(account_id, processed_at, received_at);
  `);
  return db;
}

export function closeStore(): void {
  if (db) {
    db.close();
    db = undefined;
  }
  initialized = false;
}

function ensureColumn(database: DatabaseSync, tableName: string, columnName: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function migrateAccounts(settings: LegacySettings): GmailAccount[] {
  if (Array.isArray(settings.gmailAccounts)) return settings.gmailAccounts;
  if (!settings.gmailAccount) return defaultState.settings.gmailAccounts;
  return [
    {
      id: "gmail_primary",
      email: settings.gmailAccount,
      clientId: settings.gmailClientId ?? "",
      clientSecret: settings.gmailClientSecret ?? "",
      refreshToken: settings.gmailRefreshToken ?? ""
    }
  ];
}

function normalizeJsonState(state: AppState): AppState {
  const legacySettings = state.settings as LegacySettings;
  const {
    gmailAccount: _gmailAccount,
    gmailClientId: _gmailClientId,
    gmailClientSecret: _gmailClientSecret,
    gmailRefreshToken: _gmailRefreshToken,
    ...currentSettings
  } = legacySettings;
  const gmailAccounts = migrateAccounts(legacySettings);
  const normalizedAccounts = gmailAccounts.map((account) => ({
    ...account,
    email: account.email.trim(),
    clientId: account.clientId.trim(),
    clientSecret: account.clientSecret.trim(),
    refreshToken: account.refreshToken.trim()
  }));
  const activeGmailAccountId =
    legacySettings.activeGmailAccountId || normalizedAccounts[0]?.id || defaultState.settings.activeGmailAccountId;

  return {
    ...defaultState,
    ...state,
    settings: { ...defaultState.settings, ...currentSettings, gmailAccounts: normalizedAccounts, activeGmailAccountId },
    automationTools: state.automationTools ?? defaultState.automationTools,
    emails: (state.emails ?? defaultState.emails).map((email) => ({ ...email, accountId: email.accountId || activeGmailAccountId })),
    decisions: state.decisions ?? defaultState.decisions,
    runs: state.runs ?? defaultState.runs,
    schedules: state.schedules ?? defaultState.schedules
  };
}

function rowToEmail(row: unknown): EmailRecord {
  const email = row as EmailRow;
  return {
    id: email.id,
    accountId: email.account_id,
    threadId: email.thread_id,
    from: email.sender,
    subject: email.subject,
    snippet: email.snippet,
    receivedAt: email.received_at,
    labels: JSON.parse(email.labels_json) as EmailRecord["labels"],
    unsubscribeUrl: email.unsubscribe_url ?? undefined,
    risk: email.risk,
    processedAt: email.processed_at ?? undefined
  };
}

function rowToRun(row: unknown): CleanupRun {
  const item = row as RunRow;
  return {
    id: item.id,
    startedAt: item.started_at,
    finishedAt: item.finished_at ?? undefined,
    status: item.status,
    mode: item.mode,
    scanned: item.scanned,
    deleted: item.deleted,
    archived: item.archived,
    labeled: item.labeled,
    unsubscribed: item.unsubscribed,
    backups: JSON.parse(item.backups_json) as string[],
    notes: JSON.parse(item.notes_json) as string[]
  };
}

function readEmailsFromSql(): EmailRecord[] {
  return getDb().prepare("SELECT * FROM emails ORDER BY received_at DESC").all().map(rowToEmail);
}

function readRunsFromSql(limit = maxStoredRuns): CleanupRun[] {
  return getDb().prepare("SELECT * FROM runs ORDER BY seq DESC LIMIT ?").all(limit).map(rowToRun);
}

export async function readEmailById(id: string): Promise<EmailRecord | undefined> {
  await initStore();
  const row = getDb().prepare("SELECT * FROM emails WHERE id = ?").get(id);
  return row ? rowToEmail(row) : undefined;
}

export async function readEmailsBySender(accountId: string, sender: string): Promise<EmailRecord[]> {
  await initStore();
  return getDb()
    .prepare("SELECT * FROM emails WHERE account_id = ? AND sender = ? ORDER BY received_at DESC")
    .all(accountId, sender)
    .map(rowToEmail);
}

export function readEmailPage(input: {
  accountId?: string;
  limit?: number;
  offset?: number;
  includeProcessed?: boolean;
}): { emails: EmailRecord[]; total: number; limit: number; offset: number; hasMore: boolean } {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const offset = Math.max(0, input.offset ?? 0);
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (input.accountId) {
    clauses.push("account_id = ?");
    params.push(input.accountId);
  }
  if (!input.includeProcessed) {
    clauses.push("processed_at IS NULL");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (getDb().prepare(`SELECT COUNT(*) AS count FROM emails ${where}`).get(...params) as { count: number }).count;
  const rows = getDb()
    .prepare(`SELECT * FROM emails ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map(rowToEmail);
  return { emails: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

function readLatestDecisionsFromSql(): AiDecision[] {
  return getDb()
    .prepare("SELECT * FROM latest_decisions")
    .all()
    .map((row) => {
      const decision = row as DecisionRow;
      return {
        emailId: decision.email_id,
        action: decision.action,
        labels: JSON.parse(decision.labels_json) as AiDecision["labels"],
        confidence: decision.confidence,
        reason: decision.reason,
        source: decision.source ?? "heuristic",
        unsubscribeUrl: decision.unsubscribe_url ?? undefined
      };
    });
}

function writeEmailsToSql(emails: EmailRecord[]): void {
  const database = getDb();
  const upsert = database.prepare(`
    INSERT INTO emails (id, account_id, thread_id, sender, subject, snippet, received_at, labels_json, unsubscribe_url, risk, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id=excluded.account_id,
      thread_id=excluded.thread_id,
      sender=excluded.sender,
      subject=excluded.subject,
      snippet=excluded.snippet,
      received_at=excluded.received_at,
      labels_json=excluded.labels_json,
      unsubscribe_url=excluded.unsubscribe_url,
      risk=excluded.risk,
      processed_at=COALESCE(emails.processed_at, excluded.processed_at)
  `);
  const ids = new Set(emails.map((email) => email.id));
  const existing = database.prepare("SELECT id FROM emails").all().map((row) => (row as { id: string }).id);
  database.exec("BEGIN");
  try {
    for (const email of emails) {
      upsert.run(
        email.id,
        email.accountId,
        email.threadId,
        email.from,
        email.subject,
        email.snippet,
        email.receivedAt,
        JSON.stringify(email.labels),
        email.unsubscribeUrl ?? null,
        email.risk,
        email.processedAt ?? null
      );
    }
    const remove = database.prepare("DELETE FROM emails WHERE id = ?");
    for (const id of existing) {
      if (!ids.has(id)) remove.run(id);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function writeLatestDecisionsToSql(decisions: AiDecision[]): void {
  const database = getDb();
  database.exec("DELETE FROM latest_decisions");
  upsertLatestDecisionsSync(decisions);
}

function upsertLatestDecisionsSync(decisions: AiDecision[]): void {
  const insert = getDb().prepare(`
    INSERT INTO latest_decisions (email_id, action, labels_json, confidence, reason, source, unsubscribe_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email_id) DO UPDATE SET
      action=excluded.action,
      labels_json=excluded.labels_json,
      confidence=excluded.confidence,
      reason=excluded.reason,
      source=excluded.source,
      unsubscribe_url=excluded.unsubscribe_url
  `);
  for (const decision of decisions) {
    insert.run(
      decision.emailId,
      decision.action,
      JSON.stringify(decision.labels),
      decision.confidence,
      decision.reason,
      decision.source,
      decision.unsubscribeUrl ?? null
    );
  }
}

function saveRunSync(run: CleanupRun): void {
  getDb()
    .prepare(
      `
    INSERT INTO runs (id, started_at, finished_at, status, mode, scanned, deleted, archived, labeled, unsubscribed, backups_json, notes_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      finished_at=excluded.finished_at,
      status=excluded.status,
      mode=excluded.mode,
      scanned=excluded.scanned,
      deleted=excluded.deleted,
      archived=excluded.archived,
      labeled=excluded.labeled,
      unsubscribed=excluded.unsubscribed,
      backups_json=excluded.backups_json,
      notes_json=excluded.notes_json
  `
    )
    .run(
      run.id,
      run.startedAt,
      run.finishedAt ?? null,
      run.status,
      run.mode,
      run.scanned,
      run.deleted,
      run.archived,
      run.labeled,
      run.unsubscribed,
      JSON.stringify(run.backups),
      JSON.stringify(run.notes)
    );
  pruneRunsSync();
}

function pruneRunsSync(): void {
  getDb()
    .prepare("DELETE FROM runs WHERE seq NOT IN (SELECT seq FROM runs ORDER BY seq DESC LIMIT ?)")
    .run(maxStoredRuns);
}

async function readJsonState(): Promise<AppState> {
  try {
    return normalizeJsonState(JSON.parse(await readFile(stateFile, "utf8")) as AppState);
  } catch {
    return normalizeJsonState(structuredClone(defaultState));
  }
}

async function writeJsonState(state: AppState): Promise<void> {
  const { emails: _emails, decisions: _decisions, runs: _runs, ...jsonState } = state;
  await writeFile(stateFile, `${JSON.stringify({ ...jsonState, emails: [], decisions: [], runs: [] }, null, 2)}\n`, "utf8");
}

// One-time migration/seed. Pure reads must never write, so seeding happens here at startup.
export async function initStore(): Promise<void> {
  if (initialized) return;
  await ensureDataDir();
  getDb();
  const jsonState = await readJsonState();

  if (readEmailsFromSql().length === 0 && jsonState.emails.length > 0) {
    writeEmailsToSql(jsonState.emails);
  }
  if (jsonState.decisions.length > 0 && readLatestDecisionsFromSql().length === 0) {
    upsertLatestDecisionsSync(jsonState.decisions);
  }
  if (jsonState.runs.length > 0 && readRunsFromSql(1).length === 0) {
    for (const run of [...jsonState.runs].reverse()) saveRunSync(run);
  }
  initialized = true;
}

export async function readState(): Promise<AppState> {
  await initStore();
  const state = await readJsonState();
  const emails = readEmailsFromSql();
  const emailIds = new Set(emails.map((email) => email.id));
  const decisions = readLatestDecisionsFromSql().filter((decision) => emailIds.has(decision.emailId));
  return { ...state, emails, decisions, runs: readRunsFromSql() };
}

export async function writeState(state: AppState): Promise<void> {
  await initStore();
  await withLock(async () => {
    writeEmailsToSql(state.emails);
    writeLatestDecisionsToSql(state.decisions);
    await writeJsonState(state);
  });
}

export async function resetStateForTests(): Promise<AppState> {
  if (process.env.LOCALAI_E2E !== "true") {
    throw new Error("Test state reset is only available when LOCALAI_E2E=true.");
  }
  await ensureDataDir();
  const database = getDb();
  await withLock(async () => {
    database.exec(`
      DELETE FROM decision_history;
      DELETE FROM latest_decisions;
      DELETE FROM emails;
      DELETE FROM runs;
    `);
    const state = normalizeJsonState(structuredClone(defaultState));
    writeEmailsToSql(state.emails);
    writeLatestDecisionsToSql(state.decisions);
    await writeJsonState(state);
  });
  return readState();
}

// Runs the mutator against fresh state and persists it atomically under the write lock.
export async function updateState<T>(mutator: (state: AppState) => T | Promise<T>): Promise<T> {
  await initStore();
  return withLock(async () => {
    const state = await readState();
    const result = await mutator(state);
    writeEmailsToSql(state.emails);
    writeLatestDecisionsToSql(state.decisions);
    await writeJsonState(state);
    return result;
  });
}

// Like updateState, but only persists JSON config (settings/schedules/automationTools).
// Avoids rewriting the emails and decisions tables when only configuration changed.
export async function updateConfig<T>(mutator: (state: AppState) => T | Promise<T>): Promise<T> {
  await initStore();
  return withLock(async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeJsonState(state);
    return result;
  });
}

export async function saveRun(run: CleanupRun): Promise<void> {
  await initStore();
  await withLock(() => saveRunSync(run));
}

export async function upsertLatestDecisions(decisions: AiDecision[]): Promise<void> {
  await initStore();
  await withLock(() => upsertLatestDecisionsSync(decisions));
}

export async function updateEmailLabels(emailId: string, labels: EmailRecord["labels"]): Promise<void> {
  await initStore();
  await withLock(() => {
    getDb().prepare("UPDATE emails SET labels_json = ? WHERE id = ?").run(JSON.stringify(labels), emailId);
  });
}

export async function deleteEmailsBySender(accountId: string, sender: string): Promise<void> {
  await initStore();
  await withLock(() => {
    getDb().prepare("DELETE FROM emails WHERE account_id = ? AND sender = ?").run(accountId, sender);
  });
}

export async function markEmailsProcessed(emailIds: string[], processedAt = new Date().toISOString()): Promise<void> {
  await initStore();
  await withLock(() => {
    const update = getDb().prepare("UPDATE emails SET processed_at = ? WHERE id = ?");
    for (const id of emailIds) {
      update.run(processedAt, id);
    }
  });
}

export async function recordDecisionHistory(
  runId: string,
  emails: EmailRecord[],
  decisions: AiDecision[]
): Promise<void> {
  await initStore();
  await withLock(() => {
    const byId = new Map(emails.map((email) => [email.id, email]));
    const insert = getDb().prepare(`
      INSERT INTO decision_history
        (run_id, email_id, account_id, sender, subject, action, labels_json, confidence, reason, source, unsubscribe_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const createdAt = new Date().toISOString();
    for (const decision of decisions) {
      const email = byId.get(decision.emailId);
      if (!email) continue;
      insert.run(
        runId,
        decision.emailId,
        email.accountId,
        email.from,
        email.subject,
        decision.action,
        JSON.stringify(decision.labels),
        decision.confidence,
        decision.reason,
        decision.source,
        decision.unsubscribeUrl ?? null,
        createdAt
      );
    }
  });
}

export async function queryDecisionHistory(input: {
  accountId?: string;
  sender?: string;
  subject?: string;
  limit?: number;
}): Promise<DecisionHistoryRow[]> {
  await initStore();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (input.accountId) {
    clauses.push("account_id = ?");
    params.push(input.accountId);
  }
  if (input.sender) {
    clauses.push("sender = ?");
    params.push(input.sender);
  }
  if (input.subject) {
    clauses.push("subject LIKE ?");
    params.push(`%${input.subject}%`);
  }
  params.push(Math.max(1, Math.min(input.limit ?? 10, 50)));
  const rows = getDb()
    .prepare(
      `SELECT * FROM decision_history ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params);
  return rows.map((row) => {
    const item = row as {
      run_id: string | null;
      email_id: string;
      account_id: string;
      sender: string;
      subject: string;
      action: string;
      labels_json: string;
      confidence: number;
      reason: string;
      source: AiDecision["source"] | null;
      unsubscribe_url: string | null;
      created_at: string;
    };
    return {
      runId: item.run_id,
      emailId: item.email_id,
      accountId: item.account_id,
      sender: item.sender,
      subject: item.subject,
      action: item.action,
      labels: JSON.parse(item.labels_json) as string[],
      confidence: item.confidence,
      reason: item.reason,
      source: item.source ?? "heuristic",
      unsubscribeUrl: item.unsubscribe_url ?? undefined,
      createdAt: item.created_at
    };
  });
}

export { dataDir };
