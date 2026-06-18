import { afterEach, describe, expect, it, vi } from "vitest";
import { api, parseCleanupStreamFrame } from "./api";
import { Settings } from "./types";

const settings: Settings = {
  activeGmailAccountId: "gmail_primary",
  gmailAccounts: [],
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
};

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("encodes email paging parameters", async () => {
    const fetchMock = stubFetch(
      Response.json({
        emails: [],
        total: 0,
        limit: 25,
        offset: 50,
        hasMore: false
      })
    );

    await api.emails("work inbox@example.com", 50, 25);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/emails?accountId=work%20inbox%40example.com&offset=50&limit=25",
      expect.objectContaining({ headers: { "content-type": "application/json" } })
    );
  });

  it("serializes settings updates as JSON", async () => {
    const fetchMock = stubFetch(Response.json({ ok: true, settings, automationTools: [] }));

    await api.saveSettings(settings);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(settings),
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("throws the API error message when a request fails with JSON", async () => {
    stubFetch(Response.json({ error: "Settings are invalid." }, { status: 400 }));

    await expect(api.state()).rejects.toThrow("Settings are invalid.");
  });

  it("parses server-sent cleanup stream events", async () => {
    const events = [
      'event: log\ndata: {"type":"log","at":"2026-06-18T10:00:00.000Z","message":"Started"}\n\n',
      'data: {"type":"run","at":"2026-06-18T10:00:01.000Z","message":"Done","data":{"status":"completed"}}\n\n'
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const event of events) {
          controller.enqueue(encoder.encode(event));
        }
        controller.close();
      }
    });
    stubFetch(new Response(body, { status: 200 }));
    const received: unknown[] = [];

    await api.runCleanupStream("manual", (event) => received.push(event));

    expect(received).toEqual([
      { type: "log", at: "2026-06-18T10:00:00.000Z", message: "Started" },
      {
        type: "run",
        at: "2026-06-18T10:00:01.000Z",
        message: "Done",
        data: { status: "completed" }
      }
    ]);
  });

  it("parses a final cleanup stream frame without a trailing blank line", () => {
    expect(
      parseCleanupStreamFrame('event: log\ndata: {"type":"log","at":"2026-06-18T10:00:00.000Z","message":"Final"}')
    ).toEqual({
      type: "log",
      at: "2026-06-18T10:00:00.000Z",
      message: "Final"
    });
  });
});
