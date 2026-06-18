import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { google, gmail_v1 } from "googleapis";
import { v4 as uuid } from "uuid";
import { AiDecision, EmailRecord, GmailAccount, LabelName, Settings } from "../types.js";
import { createLogger } from "./logger.js";
import { withRetry } from "./retry.js";
import { dataDir } from "./store.js";

const log = createLogger("gmail");

function gmailCall<T>(label: string, operation: () => Promise<T>): Promise<T> {
  return withRetry(operation, {
    label,
    onRetry: (attempt, error, delayMs) =>
      log.warn(`${label} retry ${attempt} after ${delayMs}ms: ${(error as Error).message}`)
  });
}

const labelColor: Record<LabelName, gmail_v1.Schema$LabelColor> = {
  Job: { backgroundColor: "#e8f0fe", textColor: "#1f108e" },
  Holiday: { backgroundColor: "#e6fffb", textColor: "#006a61" },
  Finance: { backgroundColor: "#fef3c7", textColor: "#422700" },
  Newsletter: { backgroundColor: "#eef2ff", textColor: "#3730a3" },
  Personal: { backgroundColor: "#f1f5f9", textColor: "#334155" },
  Receipt: { backgroundColor: "#e5eeff", textColor: "#213145" }
};
const processedLabelName = "LocalAIProcessed";

const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.readonly"
];

const oauthRedirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:8787/api/gmail/oauth/callback";
const defaultSyncLimit = Number(process.env.LOCALAI_GMAIL_SYNC_LIMIT ?? 500);
const gmailListPageSize = Math.min(100, Math.max(1, Number(process.env.LOCALAI_GMAIL_PAGE_SIZE ?? 100)));
const gmailFetchConcurrency = Math.max(1, Number(process.env.LOCALAI_GMAIL_FETCH_CONCURRENCY ?? 10));

function getOAuthClient(account: Pick<GmailAccount, "clientId" | "clientSecret">) {
  const client = new google.auth.OAuth2(account.clientId.trim(), account.clientSecret.trim(), oauthRedirectUri);
  return client;
}

function getAuthorizedOAuthClient(account: GmailAccount) {
  const client = getOAuthClient(account);
  client.setCredentials({ refresh_token: account.refreshToken });
  return client;
}

function findHeader(message: gmail_v1.Schema$Message, name: string): string {
  return message.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function extractUnsubscribeUrl(header: string): string | undefined {
  const match = header.match(/<([^>]+)>/);
  return match?.[1] ?? (header.startsWith("http") ? header.split(",")[0]?.trim() : undefined);
}

const sensitiveKeywords = [
  "security",
  "password",
  "2fa",
  "verification code",
  "verify",
  "invoice",
  "receipt",
  "payment",
  "statement",
  "legal",
  "account"
];
const marketingKeywords = ["sale", "deal", "% off", "newsletter", "unsubscribe", "promo", "offer", "discount"];

export function computeRisk(text: string, hasUnsubscribe: boolean): EmailRecord["risk"] {
  const haystack = text.toLowerCase();
  if (sensitiveKeywords.some((keyword) => haystack.includes(keyword))) return "high";
  if (hasUnsubscribe || marketingKeywords.some((keyword) => haystack.includes(keyword))) return "medium";
  return "low";
}

async function mapLimit<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function backupEmail(email: EmailRecord): Promise<string> {
  const backupDir = path.join(dataDir, "deleted-email-backups");
  await mkdir(backupDir, { recursive: true });
  const file = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${email.id}.json`);
  await writeFile(file, `${JSON.stringify(email, null, 2)}\n`, "utf8");
  return file;
}

export function createGmailAuthUrl(account: GmailAccount, state: string): string {
  if (!account.clientId.trim() || !account.clientSecret.trim()) {
    throw new Error(`Add and save OAuth client ID and secret for ${account.email || account.id} before connecting Google.`);
  }

  return getOAuthClient(account).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: gmailScopes,
    state
  });
}

export async function exchangeGmailAuthCode(account: GmailAccount, code: string): Promise<string> {
  if (!account.clientId.trim() || !account.clientSecret.trim()) {
    throw new Error(`Missing OAuth client ID or secret for ${account.email || account.id}.`);
  }
  const client = getOAuthClient(account);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke app access or use prompt=consent, then connect again.");
  }
  return tokens.refresh_token;
}

export async function syncGmailInbox(account: GmailAccount, maxResults = defaultSyncLimit): Promise<EmailRecord[]> {
  if (!account.clientId.trim() || !account.clientSecret.trim() || !account.refreshToken.trim()) {
    throw new Error(`Missing OAuth credentials for ${account.email || account.id}.`);
  }

  const gmail = google.gmail({ version: "v1", auth: getAuthorizedOAuthClient(account) });
  const messageIds: gmail_v1.Schema$Message[] = [];
  let pageToken: string | undefined;
  while (messageIds.length < maxResults) {
    const list = await gmailCall("messages.list", () =>
      gmail.users.messages.list({
        userId: "me",
        q: `in:inbox newer_than:90d -label:${processedLabelName}`,
        maxResults: Math.min(gmailListPageSize, maxResults - messageIds.length),
        pageToken
      })
    );
    messageIds.push(...(list.data.messages ?? []));
    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  const messages = await mapLimit(messageIds, gmailFetchConcurrency, async (item) => {
      const message = await gmailCall("messages.get", () =>
        gmail.users.messages.get({
          userId: "me",
          id: item.id ?? "",
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "List-Unsubscribe"]
        })
      );
      return message.data;
    });

  return messages.map((message) => {
    const from = findHeader(message, "From");
    const subject = findHeader(message, "Subject") || "(no subject)";
    const snippet = message.snippet ?? "";
    const unsubscribeUrl = extractUnsubscribeUrl(findHeader(message, "List-Unsubscribe"));
    return {
      id: message.id ?? uuid(),
      accountId: account.id,
      threadId: message.threadId ?? "",
      from,
      subject,
      snippet,
      receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      labels: [],
      unsubscribeUrl,
      risk: computeRisk(`${from} ${subject} ${snippet}`, Boolean(unsubscribeUrl))
    };
  });
}

async function ensureGmailLabel(gmail: gmail_v1.Gmail, name: LabelName): Promise<string> {
  return ensureNamedGmailLabel(gmail, name, labelColor[name]);
}

async function ensureNamedGmailLabel(
  gmail: gmail_v1.Gmail,
  name: string,
  color?: gmail_v1.Schema$LabelColor
): Promise<string> {
  const labels = await gmailCall("labels.list", () => gmail.users.labels.list({ userId: "me" }));
  const existing = labels.data.labels?.find((label) => label.name === name);
  if (existing?.id) return existing.id;

  const created = await gmailCall("labels.create", () =>
    gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
        color
      }
    })
  );
  if (!created.data.id) throw new Error(`Could not create Gmail label ${name}.`);
  return created.data.id;
}

export async function applyGmailDecision(
  settings: Settings,
  account: GmailAccount | undefined,
  email: EmailRecord,
  decision: AiDecision
): Promise<{ deleted: boolean; archived: boolean; labeled: boolean; backup?: string; note: string }> {
  const shouldDelete = decision.action === "delete";
  const shouldArchive = decision.action === "archive";
  const shouldLabel = settings.autoLabelEnabled && decision.labels.length > 0;
  const backup = shouldDelete && settings.backupDeletedEmails && !settings.dryRun ? await backupEmail(email) : undefined;

  if (settings.dryRun) {
    return {
      deleted: shouldDelete,
      archived: shouldArchive,
      labeled: shouldLabel,
      backup,
      note: `Dry run ${uuid().slice(0, 8)}: Gmail mutation skipped for ${email.id}.`
    };
  }

  if (!account) throw new Error(`No Google account configured for ${email.accountId}.`);
  if (!account.clientId.trim() || !account.clientSecret.trim() || !account.refreshToken.trim()) {
    throw new Error(`Missing OAuth credentials for ${account.email || account.id}.`);
  }

  const gmail = google.gmail({ version: "v1", auth: getAuthorizedOAuthClient(account) });
  const addLabelIds = [
    ...(shouldLabel ? await Promise.all(decision.labels.map((label) => ensureGmailLabel(gmail, label))) : []),
    await ensureNamedGmailLabel(gmail, processedLabelName, { backgroundColor: "#dbeafe", textColor: "#1f108e" })
  ];
  const removeLabelIds = shouldArchive ? ["INBOX"] : [];

  if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
    await gmailCall("messages.modify", () =>
      gmail.users.messages.modify({
        userId: "me",
        id: email.id,
        requestBody: {
          addLabelIds,
          removeLabelIds
        }
      })
    );
  }

  if (shouldDelete) {
    await gmailCall("messages.trash", () =>
      gmail.users.messages.trash({
        userId: "me",
        id: email.id
      })
    );
  }

  return {
    deleted: shouldDelete,
    archived: shouldArchive,
    labeled: shouldLabel,
    backup,
    note: `Applied Gmail mutation for ${email.id} on ${account.email || account.id}.`
  };
}
