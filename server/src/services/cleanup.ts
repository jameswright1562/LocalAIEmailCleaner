import { v4 as uuid } from "uuid";
import { AiDecision, CleanupEventSink, CleanupRun, EmailRecord, GmailAccount, LabelName, Settings } from "../types.js";
import { discoverAutomationTools } from "./automationTools.js";
import { applyGmailDecision } from "./gmail.js";
import { createLogger } from "./logger.js";
import { classifyEmails } from "./openAi.js";
import {
  deleteEmailsBySender,
  markEmailsProcessed,
  readEmailsBySender,
  readState,
  recordDecisionHistory,
  saveRun,
  updateEmailLabels,
  upsertLatestDecisions
} from "./store.js";
import { unsubscribeFromUrl } from "./unsubscribe.js";

const classifyBatchSize = Math.max(1, Number(process.env.LOCALAI_CLASSIFY_BATCH_SIZE ?? 20));
const log = createLogger("cleanup");

function emit(eventSink: CleanupEventSink | undefined, type: Parameters<CleanupEventSink>[0]["type"], message: string, data?: unknown): void {
  const event = { type, at: new Date().toISOString(), message, data };
  if (type === "error") log.error(message);
  else log.info(message);
  void eventSink?.(event);
}

function summarizeReasoning(decisions: AiDecision[]): string {
  return decisions
    .slice(0, 100)
    .map(
      (decision, index) =>
        `${index + 1}. ${decision.emailId}: ${decision.action} (${Math.round(decision.confidence * 100)}%, ${decision.source}) - ${decision.reason}`
    )
    .join("\n");
}

function reasoningSummaryForEmail(emailSubject: string, decisions: AiDecision[]): string {
  if (decisions.length === 0) return `No cleanup decision was returned for "${emailSubject}".`;
  return decisions
    .map(
      (decision) =>
        `${decision.source === "model" ? "Model" : "Decision engine"} chose ${decision.action} at ${Math.round(
          decision.confidence * 100
        )}% confidence. Reason: ${decision.reason}`
    )
    .join("\n");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function runCleanup(
  mode: CleanupRun["mode"] = "manual",
  eventSink?: CleanupEventSink,
  signal?: AbortSignal
): Promise<CleanupRun> {
  const state = await readState();
  const startedAt = new Date().toISOString();
  const activeEmails = state.settings.activeGmailAccountId
    ? state.emails.filter((email) => email.accountId === state.settings.activeGmailAccountId && !email.processedAt)
    : state.emails.filter((email) => !email.processedAt);
  const activeAccount = state.settings.gmailAccounts.find((account) => account.id === state.settings.activeGmailAccountId);

  const run: CleanupRun = {
    id: uuid(),
    startedAt,
    status: "running",
    mode,
    scanned: activeEmails.length,
    deleted: 0,
    archived: 0,
    labeled: 0,
    unsubscribed: 0,
    backups: [],
    notes: []
  };
  let runHadErrors = false;
  const persist = () => saveRun(run);

  await persist();
  emit(eventSink, "log", `Started ${mode} cleanup run ${run.id}.`);
  emit(eventSink, "run", `Cleanup run ${run.id} started.`, run);

  const automationTools = await discoverAutomationTools(state.settings);
  emit(eventSink, "log", `Discovered ${automationTools.length} automation tool(s).`);
  run.notes.push(
    `Automation tools: ${automationTools
      .filter((tool) => tool.enabled)
      .map((tool) => `${tool.id}=${tool.connected ? "connected" : "not-connected"}`)
      .join(", ")}`
  );
  await persist();

  const batches = chunk(activeEmails, classifyBatchSize);
  emit(
    eventSink,
    "log",
    `Processing ${activeEmails.length} unprocessed active email(s) in ${batches.length} batch(es) of up to ${classifyBatchSize}.`
  );

  const decisionsByEmail = new Map<string, AiDecision[]>();
  for (const [batchIndex, batch] of batches.entries()) {
    if (signal?.aborted) break;
    try {
      emit(
        eventSink,
        "log",
        `Classifying batch ${batchIndex + 1}/${batches.length} (${batch.length} email(s)).`
      );
      const batchDecisions = await classifyEmails(state.settings, batch, automationTools, eventSink);
      for (const email of batch) {
        decisionsByEmail.set(
          email.id,
          batchDecisions.filter((decision) => decision.emailId === email.id)
        );
      }
    } catch (error) {
      runHadErrors = true;
      emit(eventSink, "error", `Batch ${batchIndex + 1} classification failed: ${(error as Error).message}`);
    }
  }

  let aborted = false;
  for (const [index, email] of activeEmails.entries()) {
    if (signal?.aborted) {
      aborted = true;
      emit(eventSink, "log", "Cleanup run aborted before all emails were processed (client disconnected).");
      run.notes.push("Run aborted before completion (client disconnected).");
      break;
    }
    try {
      const emailDecisions = decisionsByEmail.get(email.id) ?? [];
      await upsertLatestDecisions(emailDecisions);
      await recordDecisionHistory(run.id, [email], emailDecisions);
      emit(eventSink, "log", `Recorded ${emailDecisions.length} decision(s) for ${email.id}.`);
      emit(eventSink, "reasoning", `Decision reasoning for email ${index + 1}/${activeEmails.length}.`, {
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        decisions: emailDecisions,
        content: `${reasoningSummaryForEmail(email.subject, emailDecisions)}\n\n${summarizeReasoning(emailDecisions)}`
      });

      for (const decision of emailDecisions) {
        emit(eventSink, "log", `${decision.action} ${email.id}: ${email.subject}`);
        const gmailResult = await applyGmailDecision(state.settings, activeAccount, email, decision);
        if (gmailResult.deleted) run.deleted += 1;
        if (gmailResult.archived) run.archived += 1;
        if (gmailResult.labeled) {
          run.labeled += 1;
          email.labels = [...new Set([...email.labels, ...decision.labels])];
          await updateEmailLabels(email.id, email.labels);
        }
        if (gmailResult.backup) run.backups.push(gmailResult.backup);
        run.notes.push(gmailResult.note);

        if ((mode === "unsubscribe-all" || decision.action === "unsubscribe") && decision.unsubscribeUrl) {
          const unsubscribe = await unsubscribeFromUrl(state.settings, decision.unsubscribeUrl, automationTools);
          if (unsubscribe.ok) run.unsubscribed += 1;
          else runHadErrors = true;
          run.notes.push(`${unsubscribe.method}: ${unsubscribe.note}`);
          emit(eventSink, unsubscribe.ok ? "log" : "error", `${unsubscribe.method}: ${unsubscribe.note}`);
          if (unsubscribe.ok) {
            await deleteSenderHistory(state.settings, activeAccount, email, run);
          }
        }
      }

      const processedAt = new Date().toISOString();
      email.processedAt = processedAt;
      await markEmailsProcessed([email.id], processedAt);
      await persist();
      emit(eventSink, "run", `Saved progress after ${email.id}.`, run);
    } catch (error) {
      runHadErrors = true;
      const message = `Email ${email.id} failed: ${(error as Error).message}`;
      run.notes.push(message);
      emit(eventSink, "error", message, { emailId: email.id, subject: email.subject });
      await persist();
    }
  }

  run.status = runHadErrors || aborted ? "failed" : "completed";
  run.finishedAt = new Date().toISOString();
  await persist();
  emit(eventSink, "run", `Cleanup run ${run.id} ${run.status}.`, run);
  return run;
}

export async function applyManualEmailAction(input: {
  emailId: string;
  action: AiDecision["action"];
  labels?: LabelName[];
}): Promise<{ ok: true; action: AiDecision["action"]; note: string }> {
  const state = await readState();
  const email = state.emails.find((item) => item.id === input.emailId);
  if (!email) throw new Error(`Email ${input.emailId} was not found.`);
  const account = state.settings.gmailAccounts.find((item) => item.id === state.settings.activeGmailAccountId);
  const automationTools = await discoverAutomationTools(state.settings);
  const runId = uuid();

  const decision: AiDecision = {
    emailId: email.id,
    action: input.action,
    labels: input.labels ?? email.labels,
    confidence: 1,
    reason: `Manual ${input.action} action from dashboard.`,
    source: "heuristic",
    unsubscribeUrl: email.unsubscribeUrl
  };

  const gmailResult = await applyGmailDecision(state.settings, account, email, decision);
  const notes: string[] = [gmailResult.note];
  if (gmailResult.labeled) {
    await updateEmailLabels(email.id, [...new Set([...email.labels, ...decision.labels])]);
  }

  if (input.action === "unsubscribe" && email.unsubscribeUrl) {
    const unsubscribe = await unsubscribeFromUrl(state.settings, email.unsubscribeUrl, automationTools);
    notes.push(`${unsubscribe.method}: ${unsubscribe.note}`);
    if (unsubscribe.ok && !state.settings.dryRun) {
      await deleteEmailsBySender(email.accountId, email.from);
    }
  }

  await upsertLatestDecisions([decision]);
  await recordDecisionHistory(runId, [email], [decision]);
  await markEmailsProcessed([email.id]);
  return { ok: true, action: input.action, note: notes.join(" ") };
}

async function deleteSenderHistory(
  settings: Settings,
  activeAccount: GmailAccount | undefined,
  email: EmailRecord,
  run: CleanupRun
): Promise<void> {
  const senderEmails = await readEmailsBySender(email.accountId, email.from);
  for (const senderEmail of senderEmails) {
    const deleteResult = await applyGmailDecision(settings, activeAccount, senderEmail, {
      emailId: senderEmail.id,
      action: "delete",
      labels: senderEmail.labels,
      confidence: 1,
      reason: `Deleted previous email from ${email.from} after successful unsubscribe.`,
      source: "heuristic",
      unsubscribeUrl: senderEmail.unsubscribeUrl
    });
    if (deleteResult.deleted) run.deleted += 1;
    if (deleteResult.backup) run.backups.push(deleteResult.backup);
  }
  if (!settings.dryRun) {
    await deleteEmailsBySender(email.accountId, email.from);
  }
  run.notes.push(
    `${settings.dryRun ? "Planned deletion of" : "Deleted"} ${senderEmails.length} stored previous emails from ${email.from} after unsubscribe.`
  );
}
