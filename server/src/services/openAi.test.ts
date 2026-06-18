import { describe, expect, it, vi } from "vitest";
import { AutomationTool, EmailRecord, Settings } from "../types.js";
import { classifyEmails } from "./openAi.js";

vi.mock("./mcpClient.js", () => ({
  callMcpTool: vi.fn()
}));

vi.mock("./store.js", () => ({
  queryDecisionHistory: vi.fn()
}));

const settings: Settings = {
  activeGmailAccountId: "gmail_primary",
  gmailAccounts: [],
  openAiBaseUrl: "https://api.openai.com/v1/",
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

const browserTool: AutomationTool = {
  id: "playwright.unsubscribe",
  label: "Playwright unsubscribe",
  provider: "playwright",
  enabled: true,
  connected: true,
  description: "Test browser automation"
};

function email(overrides: Partial<EmailRecord>): EmailRecord {
  return {
    id: "msg_1",
    accountId: "gmail_primary",
    threadId: "thr_1",
    from: "news@example.com",
    subject: "Weekly newsletter",
    snippet: "Unsubscribe any time.",
    receivedAt: "2026-06-18T09:00:00.000Z",
    labels: [],
    unsubscribeUrl: "https://example.com/unsubscribe",
    risk: "low",
    ...overrides
  };
}

describe("classifyEmails", () => {
  it("uses local heuristic unsubscribe decisions when no API key is configured", async () => {
    const [decision] = await classifyEmails(settings, [email({})], [browserTool]);

    expect(decision).toMatchObject({
      emailId: "msg_1",
      action: "unsubscribe",
      labels: ["Newsletter"],
      confidence: 0.91,
      source: "heuristic",
      unsubscribeUrl: "https://example.com/unsubscribe"
    });
  });

  it("keeps and labels transactional financial email", async () => {
    const [decision] = await classifyEmails(settings, [
      email({
        id: "receipt_1",
        from: "billing@example.com",
        subject: "Receipt for invoice 4871",
        snippet: "Your monthly payment receipt and tax invoice are attached.",
        labels: []
      })
    ]);

    expect(decision).toMatchObject({
      emailId: "receipt_1",
      action: "keep",
      labels: ["Finance", "Receipt"],
      source: "heuristic"
    });
  });
});
