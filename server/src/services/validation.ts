import { z } from "zod";
import { Schedule, Settings } from "../types.js";

const gmailAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  refreshToken: z.string()
});

export const settingsSchema = z.object({
  activeGmailAccountId: z.string(),
  gmailAccounts: z.array(gmailAccountSchema),
  openAiBaseUrl: z.string(),
  openAiApiKey: z.string(),
  openAiModel: z.string(),
  webclawMcpEndpoint: z.string(),
  mcpStdioCommand: z.string(),
  mcpStdioArgs: z.string(),
  mcpStdioCwd: z.string(),
  webclawEnabled: z.boolean(),
  playwrightEnabled: z.boolean(),
  autoRegisterAutomationTools: z.boolean(),
  backupDeletedEmails: z.boolean(),
  autoLabelEnabled: z.boolean(),
  dryRun: z.boolean()
}) satisfies z.ZodType<Settings>;

export const partialSettingsSchema = settingsSchema.partial();

export const scheduleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, "Time must be in HH:MM format."),
  enabled: z.boolean(),
  actions: z.object({
    deleteLowConfidence: z.boolean(),
    autoLabel: z.boolean(),
    unsubscribeNewsletters: z.boolean()
  }),
  nextRunAt: z.string()
}) satisfies z.ZodType<Schedule>;

export const cleanupModeSchema = z.enum(["manual", "scheduled", "unsubscribe-all"]).default("manual");

export const labelNameSchema = z.enum(["Job", "Holiday", "Finance", "Newsletter", "Personal", "Receipt"]);

export const emailActionSchema = z.object({
  action: z.enum(["keep", "archive", "delete", "label", "unsubscribe"]),
  labels: z.array(labelNameSchema).optional()
});

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
