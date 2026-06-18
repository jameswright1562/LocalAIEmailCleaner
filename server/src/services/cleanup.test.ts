import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, EmailRecord } from "../types.js";

const dir = mkdtempSync(path.join(tmpdir(), "localai-cleanup-"));
process.env.LOCALAI_DATA_DIR = dir;
process.env.LOCALAI_TEST_DATA = "false";

vi.mock("./automationTools.js", () => ({
  discoverAutomationTools: vi.fn(async () => [])
}));

vi.mock("./gmail.js", () => ({
  applyGmailDecision: vi.fn(async (_settings: unknown, _account: unknown, _email: unknown, decision: { action: string; labels: string[] }) => ({
    deleted: decision.action === "delete",
    archived: decision.action === "archive",
    labeled: decision.labels.length > 0,
    note: "mock gmail mutation"
  }))
}));

vi.mock("./openAi.js", () => ({
  classifyEmails: vi.fn(async (_settings: unknown, emails: EmailRecord[]) =>
    emails.map((email) => ({
      emailId: email.id,
      action: email.unsubscribeUrl ? "unsubscribe" : "label",
      labels: ["Newsletter"],
      confidence: 0.9,
      reason: "mock decision",
      source: "model",
      unsubscribeUrl: email.unsubscribeUrl
    }))
  )
}));

vi.mock("./unsubscribe.js", () => ({
  unsubscribeFromUrl: vi.fn(async () => ({ ok: true, method: "playwright", note: "mock unsubscribe" }))
}));

type Cleanup = typeof import("./cleanup.js");
type Store = typeof import("./store.js");
let cleanup: Cleanup;
let store: Store;

function email(overrides: Partial<EmailRecord>): EmailRecord {
  return {
    id: "msg",
    accountId: "acc1",
    threadId: "thr",
    from: "sender@example.com",
    subject: "Subject",
    snippet: "snippet",
    receivedAt: "2026-06-18T09:00:00.000Z",
    labels: [],
    risk: "low",
    ...overrides
  };
}

async function seed(emails: EmailRecord[], dryRun: boolean): Promise<void> {
  const base = await store.readState();
  const state: AppState = {
    ...base,
    settings: {
      ...base.settings,
      dryRun,
      activeGmailAccountId: "acc1",
      gmailAccounts: [{ id: "acc1", email: "acc1@example.com", clientId: "", clientSecret: "", refreshToken: "" }]
    },
    emails,
    decisions: [],
    schedules: []
  };
  await store.writeState(state);
}

beforeAll(async () => {
  cleanup = await import("./cleanup.js");
  store = await import("./store.js");
});

beforeEach(async () => {
  await store.writeState({ ...(await store.readState()), emails: [], decisions: [] });
});

afterAll(() => {
  store.closeStore();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may briefly hold the SQLite file; ignore teardown cleanup failures.
  }
});

describe("runCleanup", () => {
  it("classifies, labels, persists a completed run, and marks emails processed", async () => {
    await seed([email({ id: "a", from: "a@x.com" }), email({ id: "b", from: "b@x.com" })], true);

    const run = await cleanup.runCleanup("manual");

    expect(run.status).toBe("completed");
    expect(run.scanned).toBe(2);
    expect(run.labeled).toBe(2);

    const state = await store.readState();
    expect(state.runs[0]?.id).toBe(run.id);
    expect(store.readEmailPage({ accountId: "acc1" }).total).toBe(0);
    expect(store.readEmailPage({ accountId: "acc1", includeProcessed: true }).total).toBe(2);

    const history = await store.queryDecisionHistory({ accountId: "acc1", limit: 50 });
    expect(history).toHaveLength(2);
  });

  it("runs unsubscribe and keeps emails in dry-run mode while marking them processed", async () => {
    await seed([email({ id: "n1", from: "news@x.com", unsubscribeUrl: "https://x.com/unsub" })], true);

    const run = await cleanup.runCleanup("unsubscribe-all");

    expect(run.unsubscribed).toBe(1);
    expect(store.readEmailPage({ accountId: "acc1", includeProcessed: true }).total).toBe(1);
    expect(store.readEmailPage({ accountId: "acc1" }).total).toBe(0);
  });
});

describe("applyManualEmailAction", () => {
  it("labels a single email, persists labels, and marks it processed", async () => {
    await seed([email({ id: "m1", from: "a@x.com" })], true);

    const result = await cleanup.applyManualEmailAction({ emailId: "m1", action: "label", labels: ["Finance"] });

    expect(result.ok).toBe(true);
    expect(store.readEmailPage({ accountId: "acc1" }).total).toBe(0);
    const stored = await store.readEmailById("m1");
    expect(stored?.labels).toContain("Finance");
    const history = await store.queryDecisionHistory({ accountId: "acc1", limit: 10 });
    expect(history[0]?.action).toBe("label");
  });

  it("throws for an unknown email id", async () => {
    await expect(cleanup.applyManualEmailAction({ emailId: "missing", action: "delete" })).rejects.toThrow(/not found/);
  });
});
