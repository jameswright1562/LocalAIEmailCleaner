import cors from "cors";
import express from "express";
import { z } from "zod";
import { runCleanup } from "./services/cleanup.js";
import { discoverAutomationTools } from "./services/automationTools.js";
import { createGmailAuthUrl, exchangeGmailAuthCode, syncGmailInbox } from "./services/gmail.js";
import { probeModels } from "./services/models.js";
import { queryDecisionHistory, readEmailPage, readState, resetStateForTests, updateState } from "./services/store.js";
import { CleanupStreamEvent, Schedule, Settings } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/state", async (_request, response) => {
  const state = await readState();
  response.json({ ...state, emails: [] });
});

app.get("/api/emails", async (request, response) => {
  const state = await readState();
  const accountId =
    typeof request.query.accountId === "string" ? request.query.accountId : state.settings.activeGmailAccountId || undefined;
  response.json(
    readEmailPage({
      accountId,
      limit: typeof request.query.limit === "string" ? Number(request.query.limit) : undefined,
      offset: typeof request.query.offset === "string" ? Number(request.query.offset) : undefined,
      includeProcessed: request.query.includeProcessed === "true"
    })
  );
});

app.put("/api/settings", async (request, response) => {
  const settings = request.body as Settings;
  const automationTools = await discoverAutomationTools(settings);
  await updateState((state) => {
    state.settings = settings;
    state.automationTools = automationTools;
  });
  response.json({ ok: true, settings, automationTools });
});

app.post("/api/tools/probe", async (_request, response) => {
  const state = await readState();
  const automationTools = await discoverAutomationTools(state.settings);
  await updateState((nextState) => {
    nextState.automationTools = automationTools;
  });
  response.json({ ok: true, automationTools });
});

app.post("/api/models/probe", async (request, response) => {
  const state = await readState();
  const settings = { ...state.settings, ...(request.body as Partial<Settings>) };
  response.json(await probeModels(settings));
});

app.get("/api/decisions/history", async (request, response) => {
  response.json(
    await queryDecisionHistory({
      accountId: typeof request.query.accountId === "string" ? request.query.accountId : undefined,
      sender: typeof request.query.sender === "string" ? request.query.sender : undefined,
      subject: typeof request.query.subject === "string" ? request.query.subject : undefined,
      limit: typeof request.query.limit === "string" ? Number(request.query.limit) : undefined
    })
  );
});

app.post("/api/gmail/sync", async (_request, response) => {
  try {
    const state = await readState();
    const account = state.settings.gmailAccounts.find((item) => item.id === state.settings.activeGmailAccountId);
    if (!account) {
      response.status(400).json({ ok: false, error: "No active Google account configured." });
      return;
    }

    const emails = await syncGmailInbox(account);
    await updateState((nextState) => {
      const oldAccountEmailIds = new Set(
        nextState.emails.filter((email) => email.accountId === account.id).map((email) => email.id)
      );
      const processedAccountEmails = nextState.emails.filter((email) => email.accountId === account.id && email.processedAt);
      const processedIds = new Set(processedAccountEmails.map((email) => email.id));
      const unprocessedSyncedEmails = emails.filter((email) => !processedIds.has(email.id));
      nextState.emails = [
        ...nextState.emails.filter((email) => email.accountId !== account.id),
        ...processedAccountEmails,
        ...unprocessedSyncedEmails
      ];
      nextState.decisions = nextState.decisions.filter((decision) => !oldAccountEmailIds.has(decision.emailId));
    });
    response.json({ ok: true, accountId: account.id, count: emails.length });
  } catch (error) {
    response.status(400).json({ ok: false, error: (error as Error).message });
  }
});

app.post("/api/gmail/oauth/url", async (_request, response) => {
  try {
    const state = await readState();
    const account = state.settings.gmailAccounts.find((item) => item.id === state.settings.activeGmailAccountId);
    if (!account) {
      response.status(400).json({ ok: false, error: "No active Google account configured." });
      return;
    }
    response.json({ ok: true, authUrl: createGmailAuthUrl(account, account.id) });
  } catch (error) {
    response.status(400).json({ ok: false, error: (error as Error).message });
  }
});

app.get("/api/gmail/oauth/callback", async (request, response) => {
  try {
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const accountId = typeof request.query.state === "string" ? request.query.state : "";
    if (!code || !accountId) throw new Error("OAuth callback is missing code or state.");

    await updateState(async (state) => {
      const account = state.settings.gmailAccounts.find((item) => item.id === accountId);
      if (!account) throw new Error("OAuth callback account was not found.");
      account.refreshToken = await exchangeGmailAuthCode(account, code);
      state.settings.activeGmailAccountId = account.id;
    });

    response.redirect("http://127.0.0.1:5173");
  } catch (error) {
    response
      .status(400)
      .send(`<pre>Google OAuth failed: ${(error as Error).message}</pre><p>You can close this tab and return to LocalAI Mail.</p>`);
  }
});

app.post("/api/cleanup/run", async (request, response) => {
  const mode = z.enum(["manual", "scheduled", "unsubscribe-all"]).default("manual").parse(request.body?.mode);
  response.json(await runCleanup(mode));
});

app.post("/api/cleanup/run/stream", async (request, response) => {
  const mode = z.enum(["manual", "scheduled", "unsubscribe-all"]).default("manual").parse(request.body?.mode);
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });

  const send = (event: CleanupStreamEvent) => {
    response.write(`event: ${event.type}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    send({ type: "log", at: new Date().toISOString(), message: "Streaming cleanup run started." });
    await runCleanup(mode, send);
  } catch (error) {
    send({ type: "error", at: new Date().toISOString(), message: (error as Error).message });
  } finally {
    response.end();
  }
});

app.post("/api/unsubscribe/all", async (_request, response) => {
  response.json(await runCleanup("unsubscribe-all"));
});

app.post("/api/schedules", async (request, response) => {
  const schedule = request.body as Schedule;
  await updateState((state) => {
    const index = state.schedules.findIndex((item) => item.id === schedule.id);
    if (index >= 0) state.schedules[index] = schedule;
    else state.schedules.unshift(schedule);
  });
  response.json({ ok: true, schedule });
});

app.delete("/api/schedules/:id", async (request, response) => {
  await updateState((state) => {
    state.schedules = state.schedules.filter((schedule) => schedule.id !== request.params.id);
  });
  response.json({ ok: true });
});

if (process.env.LOCALAI_E2E === "true") {
  app.post("/api/test/reset", async (_request, response) => {
    response.json(await resetStateForTests());
  });
}

async function discoverToolsOnStartup(): Promise<void> {
  const state = await readState();
  if (!state.settings.mcpStdioCommand.trim()) {
    console.log("MCP stdio command is not configured; skipping MCP startup.");
    return;
  }

  console.log(
    `Starting MCP stdio server: ${state.settings.mcpStdioCommand} ${state.settings.mcpStdioArgs}`.trim()
  );
  const automationTools = await discoverAutomationTools(state.settings);
  await updateState((nextState) => {
    nextState.automationTools = automationTools;
  });
  console.log(
    `MCP/tool discovery complete: ${automationTools
      .map((tool) => `${tool.label}=${tool.connected ? "connected" : "not-connected"}`)
      .join(", ")}`
  );
}

app.listen(port, "127.0.0.1", () => {
  console.log(`LocalAI Email Cleaner API listening on http://127.0.0.1:${port}`);
  void discoverToolsOnStartup().catch((error: unknown) => {
    console.error(`MCP startup failed: ${(error as Error).message}`);
  });
});
