import { v4 as uuid } from "uuid";
import { AiDecision, CleanupEventSink, CleanupRun } from "../types.js";
import { discoverAutomationTools } from "./automationTools.js";
import { applyGmailDecision } from "./gmail.js";
import { classifyEmails } from "./openAi.js";
import { readState, recordDecisionHistory, writeState } from "./store.js";
import { unsubscribeFromUrl } from "./unsubscribe.js";

function emit(eventSink: CleanupEventSink | undefined, type: Parameters<CleanupEventSink>[0]["type"], message: string, data?: unknown): void {
  const event = { type, at: new Date().toISOString(), message, data };
  if (type === "error") console.error(`[cleanup] ${message}`);
  else console.log(`[cleanup] ${message}`);
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

export async function runCleanup(mode: CleanupRun["mode"] = "manual", eventSink?: CleanupEventSink): Promise<CleanupRun> {
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

  const persist = async () => {
    const runIndex = state.runs.findIndex((item) => item.id === run.id);
    if (runIndex >= 0) state.runs[runIndex] = run;
    await writeState(state);
  };

  state.runs.unshift(run);
  emit(eventSink, "log", `Started ${mode} cleanup run ${run.id}.`);
  emit(eventSink, "run", `Cleanup run ${run.id} started.`, run);

  const automationTools = await discoverAutomationTools(state.settings);
  state.automationTools = automationTools;
  emit(eventSink, "log", `Discovered ${automationTools.length} automation tool(s).`);
  run.notes.push(
    `Automation tools: ${automationTools
      .filter((tool) => tool.enabled)
      .map((tool) => `${tool.id}=${tool.connected ? "connected" : "not-connected"}`)
      .join(", ")}`
  );
  await persist();

  emit(eventSink, "log", `Processing ${activeEmails.length} unprocessed active email(s), one model request per email.`);

  for (const [index, email] of activeEmails.entries()) {
    try {
      emit(eventSink, "log", `Classifying email ${index + 1}/${activeEmails.length}: ${email.subject}`);
      const emailDecisions = await classifyEmails(state.settings, [email], automationTools, eventSink);
      state.decisions = [...state.decisions.filter((decision) => decision.emailId !== email.id), ...emailDecisions];
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
            const senderEmails = state.emails.filter(
              (storedEmail) => storedEmail.accountId === email.accountId && storedEmail.from === email.from
            );
            for (const senderEmail of senderEmails) {
              const deleteResult = await applyGmailDecision(state.settings, activeAccount, senderEmail, {
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
            if (!state.settings.dryRun) {
              state.emails = state.emails.filter(
                (storedEmail) => !(storedEmail.accountId === email.accountId && storedEmail.from === email.from)
              );
            }
            run.notes.push(
              `${state.settings.dryRun ? "Planned deletion of" : "Deleted"} ${senderEmails.length} stored previous emails from ${email.from} after unsubscribe.`
            );
            emit(
              eventSink,
              "log",
              `${state.settings.dryRun ? "Planned deletion of" : "Deleted"} ${senderEmails.length} stored previous emails from ${email.from}.`
            );
          }
        }
      }

      email.processedAt = new Date().toISOString();
      const storedEmail = state.emails.find((item) => item.id === email.id);
      if (storedEmail) {
        storedEmail.labels = email.labels;
        storedEmail.processedAt = email.processedAt;
      }
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

  run.status = runHadErrors ? "failed" : "completed";
  run.finishedAt = new Date().toISOString();
  await persist();
  emit(eventSink, "run", `Cleanup run ${run.id} ${run.status}.`, run);
  return run;
}
