export type LabelName = "Job" | "Holiday" | "Finance" | "Newsletter" | "Personal" | "Receipt";

export type GmailAccount = {
  id: string;
  email: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type Settings = {
  activeGmailAccountId: string;
  gmailAccounts: GmailAccount[];
  openAiBaseUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  webclawMcpEndpoint: string;
  mcpStdioCommand: string;
  mcpStdioArgs: string;
  mcpStdioCwd: string;
  webclawEnabled: boolean;
  playwrightEnabled: boolean;
  autoRegisterAutomationTools: boolean;
  backupDeletedEmails: boolean;
  autoLabelEnabled: boolean;
  dryRun: boolean;
};

export type AutomationTool = {
  id: string;
  label: string;
  provider: "mcp-stdio" | "playwright";
  enabled: boolean;
  connected: boolean;
  description: string;
  mcpName?: string;
  inputSchema?: Record<string, unknown>;
};

export type DecisionSource = "model" | "heuristic" | "model-fallback";

export type ModelInfo = {
  id: string;
  created?: number;
  ownedBy?: string;
};

export type ModelProbe = {
  ok: boolean;
  baseUrl: string;
  models: ModelInfo[];
  error?: string;
};

export type EmailRecord = {
  id: string;
  accountId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  labels: LabelName[];
  unsubscribeUrl?: string;
  risk: "low" | "medium" | "high";
  processedAt?: string;
};

export type AiDecision = {
  emailId: string;
  action: "keep" | "archive" | "delete" | "label" | "unsubscribe";
  labels: LabelName[];
  confidence: number;
  reason: string;
  source: DecisionSource;
  unsubscribeUrl?: string;
};

export type CleanupRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "completed" | "failed";
  mode: "manual" | "scheduled" | "unsubscribe-all";
  scanned: number;
  deleted: number;
  archived: number;
  labeled: number;
  unsubscribed: number;
  backups: string[];
  notes: string[];
};

export type CleanupStreamEvent = {
  type: "log" | "model_delta" | "model_result" | "reasoning" | "run" | "error";
  at: string;
  message: string;
  data?: unknown;
};

export type CleanupEventSink = (event: CleanupStreamEvent) => void | Promise<void>;

export type Schedule = {
  id: string;
  name: string;
  cadence: "daily" | "weekly" | "monthly";
  time: string;
  enabled: boolean;
  actions: {
    deleteLowConfidence: boolean;
    autoLabel: boolean;
    unsubscribeNewsletters: boolean;
  };
  nextRunAt: string;
};

export type AppState = {
  settings: Settings;
  automationTools: AutomationTool[];
  emails: EmailRecord[];
  decisions: AiDecision[];
  runs: CleanupRun[];
  schedules: Schedule[];
};
