import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppState, EmailRecord } from "../types.js";

const dir = mkdtempSync(path.join(tmpdir(), "localai-store-"));
process.env.LOCALAI_DATA_DIR = dir;
process.env.LOCALAI_TEST_DATA = "false";
process.env.LOCALAI_MAX_RUNS = "3";

type Store = typeof import("./store.js");
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

async function seed(emails: EmailRecord[]): Promise<AppState> {
  const base = await store.readState();
  const state: AppState = {
    ...base,
    settings: {
      ...base.settings,
      activeGmailAccountId: "acc1",
      gmailAccounts: [{ id: "acc1", email: "acc1@example.com", clientId: "", clientSecret: "", refreshToken: "" }]
    },
    emails,
    decisions: [],
    schedules: []
  };
  await store.writeState(state);
  return state;
}

beforeAll(async () => {
  store = await import("./store.js");
});

afterAll(() => {
  store.closeStore();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may briefly hold the SQLite file; ignore teardown cleanup failures.
  }
});

describe("store", () => {
  it("round-trips emails through SQLite", async () => {
    await seed([email({ id: "a" }), email({ id: "b", receivedAt: "2026-06-17T09:00:00.000Z" })]);
    const state = await store.readState();
    expect(state.emails.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("paginates and filters processed emails", async () => {
    await seed([
      email({ id: "p1", receivedAt: "2026-06-18T10:00:00.000Z" }),
      email({ id: "p2", receivedAt: "2026-06-18T09:00:00.000Z" }),
      email({ id: "p3", receivedAt: "2026-06-18T08:00:00.000Z" })
    ]);
    const firstPage = store.readEmailPage({ accountId: "acc1", limit: 2, offset: 0 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.emails.map((item) => item.id)).toEqual(["p1", "p2"]);

    await store.markEmailsProcessed(["p1"]);
    const unprocessed = store.readEmailPage({ accountId: "acc1" });
    expect(unprocessed.total).toBe(2);
    const includingProcessed = store.readEmailPage({ accountId: "acc1", includeProcessed: true });
    expect(includingProcessed.total).toBe(3);
  });

  it("stores runs newest-first and prunes beyond LOCALAI_MAX_RUNS", async () => {
    for (let index = 0; index < 5; index += 1) {
      await store.saveRun({
        id: `run_${index}`,
        startedAt: new Date(2026, 5, 18, 0, index).toISOString(),
        status: "completed",
        mode: "manual",
        scanned: 0,
        deleted: 0,
        archived: 0,
        labeled: 0,
        unsubscribed: 0,
        backups: [],
        notes: []
      });
    }
    const state = await store.readState();
    expect(state.runs).toHaveLength(3);
    expect(state.runs.map((run) => run.id)).toEqual(["run_4", "run_3", "run_2"]);
  });

  it("serializes concurrent updateState calls without losing writes", async () => {
    await seed([email({ id: "x" })]);
    await Promise.all([
      store.updateState((state) => {
        state.schedules.push({
          id: "s1",
          name: "one",
          cadence: "daily",
          time: "09:00",
          enabled: true,
          actions: { deleteLowConfidence: false, autoLabel: true, unsubscribeNewsletters: false },
          nextRunAt: new Date().toISOString()
        });
      }),
      store.updateState((state) => {
        state.schedules.push({
          id: "s2",
          name: "two",
          cadence: "weekly",
          time: "10:00",
          enabled: true,
          actions: { deleteLowConfidence: false, autoLabel: true, unsubscribeNewsletters: false },
          nextRunAt: new Date().toISOString()
        });
      })
    ]);
    const state = await store.readState();
    expect(state.schedules.map((schedule) => schedule.id).sort()).toEqual(["s1", "s2"]);
  });
});
