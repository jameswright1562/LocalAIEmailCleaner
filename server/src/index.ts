import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { applyManualEmailAction, runCleanup } from "./services/cleanup.js";
import { discoverAutomationTools } from "./services/automationTools.js";
import { createGmailAuthUrl, exchangeGmailAuthCode, syncGmailInbox } from "./services/gmail.js";
import { createLogger } from "./services/logger.js";
import { probeModels } from "./services/models.js";
import { startScheduler } from "./services/scheduler.js";
import {
  closeStore,
  initStore,
  queryDecisionHistory,
  readEmailPage,
  readState,
  resetStateForTests,
  updateConfig,
  updateState
} from "./services/store.js";
import {
  cleanupModeSchema,
  emailActionSchema,
  formatZodError,
  partialSettingsSchema,
  scheduleSchema,
  settingsSchema
} from "./services/validation.js";
import { CleanupStreamEvent } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const clientUrl = process.env.LOCALAI_CLIENT_URL ?? "http://127.0.0.1:5173";
const log = createLogger("api");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

type AsyncRoute = (request: Request, response: Response) => Promise<unknown>;

function asyncHandler(route: AsyncRoute) {
  return (request: Request, response: Response, next: NextFunction): void => {
    route(request, response).catch(next);
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

app.get(
  "/api/state",
  asyncHandler(async (_request, response) => {
    const state = await readState();
    response.json({ ...state, emails: [] });
  })
);

app.get(
  "/api/emails",
  asyncHandler(async (request, response) => {
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
  })
);

app.put(
  "/api/settings",
  asyncHandler(async (request, response) => {
    const settings = settingsSchema.parse(request.body);
    const automationTools = await discoverAutomationTools(settings);
    await updateConfig((state) => {
      state.settings = settings;
      state.automationTools = automationTools;
    });
    response.json({ ok: true, settings, automationTools });
  })
);

app.post(
  "/api/tools/probe",
  asyncHandler(async (_request, response) => {
    const state = await readState();
    const automationTools = await discoverAutomationTools(state.settings);
    await updateConfig((nextState) => {
      nextState.automationTools = automationTools;
    });
    response.json({ ok: true, automationTools });
  })
);

app.post(
  "/api/models/probe",
  asyncHandler(async (request, response) => {
    const state = await readState();
    const settings = { ...state.settings, ...partialSettingsSchema.parse(request.body) };
    response.json(await probeModels(settings));
  })
);

app.get(
  "/api/decisions/history",
  asyncHandler(async (request, response) => {
    response.json(
      await queryDecisionHistory({
        accountId: typeof request.query.accountId === "string" ? request.query.accountId : undefined,
        sender: typeof request.query.sender === "string" ? request.query.sender : undefined,
        subject: typeof request.query.subject === "string" ? request.query.subject : undefined,
        limit: typeof request.query.limit === "string" ? Number(request.query.limit) : undefined
      })
    );
  })
);

app.post(
  "/api/gmail/sync",
  asyncHandler(async (_request, response) => {
    const state = await readState();
    const account = state.settings.gmailAccounts.find((item) => item.id === state.settings.activeGmailAccountId);
    if (!account) throw new HttpError(400, "No active Google account configured.");

    const emails = await syncGmailInbox(account).catch((error: unknown) => {
      throw new HttpError(400, (error as Error).message);
    });
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
  })
);

app.post(
  "/api/gmail/oauth/url",
  asyncHandler(async (_request, response) => {
    const state = await readState();
    const account = state.settings.gmailAccounts.find((item) => item.id === state.settings.activeGmailAccountId);
    if (!account) throw new HttpError(400, "No active Google account configured.");
    try {
      response.json({ ok: true, authUrl: createGmailAuthUrl(account, account.id) });
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  })
);

app.get(
  "/api/gmail/oauth/callback",
  asyncHandler(async (request, response) => {
    try {
      const code = typeof request.query.code === "string" ? request.query.code : "";
      const accountId = typeof request.query.state === "string" ? request.query.state : "";
      if (!code || !accountId) throw new Error("OAuth callback is missing code or state.");

      await updateConfig(async (state) => {
        const account = state.settings.gmailAccounts.find((item) => item.id === accountId);
        if (!account) throw new Error("OAuth callback account was not found.");
        account.refreshToken = await exchangeGmailAuthCode(account, code);
        state.settings.activeGmailAccountId = account.id;
      });

      response.redirect(clientUrl);
    } catch (error) {
      response
        .status(400)
        .send(`<pre>Google OAuth failed: ${(error as Error).message}</pre><p>You can close this tab and return to LocalAI Mail.</p>`);
    }
  })
);

app.post(
  "/api/cleanup/run",
  asyncHandler(async (request, response) => {
    const mode = cleanupModeSchema.parse(request.body?.mode);
    response.json(await runCleanup(mode));
  })
);

app.post(
  "/api/cleanup/run/stream",
  asyncHandler(async (request, response) => {
    const mode = cleanupModeSchema.parse(request.body?.mode);
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    const controller = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) {
        log.warn("Cleanup stream client disconnected; aborting run.");
        controller.abort();
      }
    });

    const send = (event: CleanupStreamEvent) => {
      if (response.writableEnded) return;
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      send({ type: "log", at: new Date().toISOString(), message: "Streaming cleanup run started." });
      await runCleanup(mode, send, controller.signal);
    } catch (error) {
      send({ type: "error", at: new Date().toISOString(), message: (error as Error).message });
    } finally {
      response.end();
    }
  })
);

app.post(
  "/api/emails/:id/action",
  asyncHandler(async (request, response) => {
    const body = emailActionSchema.parse(request.body);
    try {
      const result = await applyManualEmailAction({ emailId: String(request.params.id), action: body.action, labels: body.labels });
      response.json(result);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
  })
);

app.post(
  "/api/unsubscribe/all",
  asyncHandler(async (_request, response) => {
    response.json(await runCleanup("unsubscribe-all"));
  })
);

app.post(
  "/api/schedules",
  asyncHandler(async (request, response) => {
    const schedule = scheduleSchema.parse(request.body);
    await updateConfig((state) => {
      const index = state.schedules.findIndex((item) => item.id === schedule.id);
      if (index >= 0) state.schedules[index] = schedule;
      else state.schedules.unshift(schedule);
    });
    response.json({ ok: true, schedule });
  })
);

app.delete(
  "/api/schedules/:id",
  asyncHandler(async (request, response) => {
    await updateConfig((state) => {
      state.schedules = state.schedules.filter((schedule) => schedule.id !== request.params.id);
    });
    response.json({ ok: true });
  })
);

if (process.env.LOCALAI_E2E === "true") {
  app.post(
    "/api/test/reset",
    asyncHandler(async (_request, response) => {
      response.json(await resetStateForTests());
    })
  );
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({ ok: false, error: formatZodError(error) });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ ok: false, error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  log.error(message);
  response.status(500).json({ ok: false, error: message });
});

async function discoverToolsOnStartup(): Promise<void> {
  const state = await readState();
  if (!state.settings.mcpStdioCommand.trim()) {
    log.info("MCP stdio command is not configured; skipping MCP startup.");
    return;
  }

  log.info(`Starting MCP stdio server: ${state.settings.mcpStdioCommand} ${state.settings.mcpStdioArgs}`.trim());
  const automationTools = await discoverAutomationTools(state.settings);
  await updateConfig((nextState) => {
    nextState.automationTools = automationTools;
  });
  log.info(
    `MCP/tool discovery complete: ${automationTools
      .map((tool) => `${tool.label}=${tool.connected ? "connected" : "not-connected"}`)
      .join(", ")}`
  );
}

app.listen(port, "127.0.0.1", () => {
  log.info(`LocalAI Email Cleaner API listening on http://127.0.0.1:${port}`);
  void initStore()
    .then(() => discoverToolsOnStartup())
    .catch((error: unknown) => {
      log.error(`MCP startup failed: ${(error as Error).message}`);
    });
  if (process.env.LOCALAI_E2E !== "true") {
    startScheduler();
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    closeStore();
    process.exit(0);
  });
}
