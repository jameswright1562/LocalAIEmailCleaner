import { v4 as uuid } from "uuid";
import { AiDecision, CleanupEventSink, CleanupRun } from "../types.js";
import { discoverAutomationTools } from "./automationTools.js";
import { applyGmailDecision } from "./gmail.js";
import { classifyEmails } from "./openAi.js";
import { recordDecisionHistory, updateState } from "./store.js";
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

export async function runCleanup(mode: CleanupRun["mode"] = "manual", eventSink?: CleanupEventSink): Promise<CleanupRun> {
  return updateState(async (state) => {
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

    emit(eventSink, "log", `Classifying ${activeEmails.length} unprocessed active email(s), one model request per email.`);
    const decisions: AiDecision[] = [];
    for (const [index, email] of activeEmails.entries()) {
      emit(eventSink, "log", `Classifying email ${index + 1}/${activeEmails.length}: ${email.subject}`);
      const emailDecisions = await classifyEmails(state.settings, [email], automationTools, eventSink);
      decisions.push(...emailDecisions);
      emit(eventSink, "log", `Email ${index + 1}/${activeEmails.length} produced ${emailDecisions.length} decision(s).`);
      emit(eventSink, "reasoning", `Decision reasoning for email ${index + 1}/${activeEmails.length}.`, {
        content: summarizeReasoning(emailDecisions)
      });
    }
    const activeEmailIds = new Set(activeEmails.map((email) => email.id));
    state.decisions = [...state.decisions.filter((decision) => !activeEmailIds.has(decision.emailId)), ...decisions];
    await recordDecisionHistory(run.id, activeEmails, decisions);
    emit(eventSink, "log", `Recorded ${decisions.length} cleanup decision(s).`);

    const emailById = new Map(activeEmails.map((email) => [email.id, email]));
    for (const decision of decisions) {
      const email = emailById.get(decision.emailId);
      if (!email) continue;
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
      email.processedAt = new Date().toISOString();
      const storedEmail = state.emails.find((item) => item.id === email.id);
      if (storedEmail) {
        storedEmail.labels = email.labels;
        storedEmail.processedAt = email.processedAt;
      }
      emit(eventSink, "run", `Updated stats after ${decision.emailId}.`, run);

      if ((mode === "unsubscribe-all" || decision.action === "unsubscribe") && decision.unsubscribeUrl) {
        const unsubscribe = await unsubscribeFromUrl(state.settings, decision.unsubscribeUrl, automationTools);
        if (unsubscribe.ok) run.unsubscribed += 1;
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

    run.status = "completed";
    run.finishedAt = new Date().toISOString();
    emit(eventSink, "run", `Cleanup run ${run.id} completed.`, run);
    return run;
  });
}
