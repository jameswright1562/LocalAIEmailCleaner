import OpenAI from "openai";
import {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from "openai/resources/chat/completions";
import { AiDecision, AutomationTool, CleanupEventSink, EmailRecord, LabelName, Settings } from "../types.js";
import { queryDecisionHistory } from "./store.js";
import { callMcpTool } from "./mcpClient.js";
import { withRetry } from "./retry.js";

const labelPool = ["Job", "Holiday", "Finance", "Newsletter", "Personal", "Receipt"] as const;

const cleanupSystemPrompt = `
You are the local AI decision engine for LocalAI Email Cleaner, a privacy-first Gmail cleanup app.

Workflow:
1. Inspect each email independently using sender, subject, snippet, current labels, risk, and unsubscribe URL.
2. Decide the least destructive useful action: keep, label, archive, unsubscribe, or delete.
3. Never delete transactional, legal, account, invoice, receipt, travel booking, job application, personal, security, password, 2FA, or human conversation mail.
4. Only recommend delete for obvious low-value bulk mail when the user policy allows deletion and a backup will be stored first.
5. Prefer "unsubscribe" for recurring marketing/newsletter senders when an unsubscribe URL is present and a browser automation tool is available.
6. Prefer "label" for useful mail that should remain searchable. Use only these labels: Job, Holiday, Finance, Newsletter, Personal, Receipt.
7. Use "archive" only when the email is low-risk and no longer needs inbox attention.
8. Respect dry-run mode: produce the same decisions, but describe that mutations will be simulated.
9. Explain decisions briefly and operationally. Do not invent links or facts.
10. When the sender looks familiar or the decision is ambiguous, use the query_email_decision_history tool before deciding.
11. Return strict JSON only, with no markdown, no prose outside JSON.

Output schema:
{
  "decisions": [
    {
      "emailId": "string",
      "action": "keep|archive|delete|label|unsubscribe",
      "labels": ["Job|Holiday|Finance|Newsletter|Personal|Receipt"],
      "confidence": 0.0,
      "reason": "short operational reason",
      "unsubscribeUrl": "optional URL copied from input only"
    }
  ]
}
`;

const aiTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_email_decision_history",
      description:
        "Query prior stored cleanup decisions from local SQL by account, sender, or subject to keep future decisions consistent.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string" },
          sender: { type: "string" },
          subject: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 50 }
        }
      }
    }
  }
];

type HistoryToolArgs = {
  accountId?: string;
  sender?: string;
  subject?: string;
  limit?: number;
};

type ModelDecision = Omit<AiDecision, "source"> & { source?: AiDecision["source"] };

type NormalizedCompletion = {
  content: string;
  toolCalls: ChatCompletionMessageToolCall[];
};

type PendingToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export function parseToolArgs(raw: string): HistoryToolArgs {
  const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  return {
    accountId: typeof parsed.accountId === "string" ? parsed.accountId : undefined,
    sender: typeof parsed.sender === "string" ? parsed.sender : undefined,
    subject: typeof parsed.subject === "string" ? parsed.subject : undefined,
    limit: typeof parsed.limit === "number" ? parsed.limit : undefined
  };
}

export function parseGenericToolArgs(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw || "{}") as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

export function toOpenAiToolName(toolName: string): string {
  return `mcp_${toolName.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
}

function toMcpOpenAiTools(automationTools: AutomationTool[]): {
  tools: ChatCompletionTool[];
  toolNameMap: Map<string, AutomationTool>;
} {
  const toolNameMap = new Map<string, AutomationTool>();
  const tools = automationTools
    .filter((tool) => tool.provider === "mcp-stdio" && tool.enabled && tool.connected && tool.mcpName)
    .map((tool) => {
      const name = toOpenAiToolName(tool.mcpName ?? tool.label);
      toolNameMap.set(name, tool);
      return {
        type: "function" as const,
        function: {
          name,
          description: tool.description || `Call MCP tool ${tool.mcpName ?? tool.label}.`,
          parameters: tool.inputSchema ?? {
            type: "object",
            additionalProperties: true
          }
        }
      };
    });

  return { tools, toolNameMap };
}

function emit(eventSink: CleanupEventSink | undefined, type: Parameters<CleanupEventSink>[0]["type"], message: string, data?: unknown): void {
  void eventSink?.({ type, at: new Date().toISOString(), message, data });
}

async function requestCompletion(
  client: OpenAI,
  model: string,
  tools: ChatCompletionTool[],
  messages: ChatCompletionMessageParam[],
  eventSink?: CleanupEventSink
): Promise<NormalizedCompletion> {
  if (!eventSink) {
    const completion = await withRetry(() =>
      client.chat.completions.create({
        model,
        tools,
        tool_choice: "auto",
        messages
      })
    );
    const message = completion.choices[0]?.message;
    return {
      content: message?.content ?? "",
      toolCalls: message?.tool_calls ?? []
    };
  }

  const stream = await withRetry(() =>
    client.chat.completions.create({
      model,
      tools,
      tool_choice: "auto",
      messages,
      stream: true
    })
  );
  let content = "";
  const pendingToolCalls = new Map<number, PendingToolCall>();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      content += delta.content;
      emit(eventSink, "model_delta", delta.content);
    }
    for (const toolCall of delta.tool_calls ?? []) {
      const index = toolCall.index ?? 0;
      const pending =
        pendingToolCalls.get(index) ??
        ({
          id: toolCall.id ?? `tool_${index}`,
          type: "function",
          function: { name: "", arguments: "" }
        } satisfies PendingToolCall);
      if (toolCall.id) pending.id = toolCall.id;
      if (toolCall.function?.name) pending.function.name += toolCall.function.name;
      if (toolCall.function?.arguments) pending.function.arguments += toolCall.function.arguments;
      pendingToolCalls.set(index, pending);
    }
  }

  const toolCalls = [...pendingToolCalls.values()].filter((toolCall) => toolCall.function.name);
  if (toolCalls.length > 0) emit(eventSink, "log", `Model requested ${toolCalls.length} tool call(s).`);
  return { content, toolCalls: toolCalls as ChatCompletionMessageToolCall[] };
}

export function heuristicDecision(email: EmailRecord, automationTools: AutomationTool[] = []): AiDecision {
  const subject = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
  const labels = new Set<LabelName>(email.labels);
  if (subject.includes("job") || subject.includes("interview")) labels.add("Job");
  if (subject.includes("flight") || subject.includes("holiday") || subject.includes("travel")) labels.add("Holiday");
  if (subject.includes("invoice") || subject.includes("receipt") || subject.includes("payment")) labels.add("Finance");
  if (subject.includes("receipt")) labels.add("Receipt");
  if (subject.includes("unsubscribe") || subject.includes("weekly") || subject.includes("newsletter")) labels.add("Newsletter");

  const hasUnsubscribeTool = automationTools.some((tool) => tool.enabled && tool.connected);
  const isNewsletter = labels.has("Newsletter");
  const isReceipt = labels.has("Receipt") || labels.has("Finance");
  const action: AiDecision["action"] =
    isNewsletter && email.unsubscribeUrl && hasUnsubscribeTool ? "unsubscribe" : isReceipt ? "keep" : "label";

  return {
    emailId: email.id,
    action,
    labels: [...labels],
    confidence: isNewsletter ? 0.91 : 0.84,
    reason: isNewsletter
      ? hasUnsubscribeTool
        ? "Recurring sender with a detected unsubscribe URL and an available browser automation tool."
        : "Recurring sender has an unsubscribe URL, but no connected automation tool is available."
      : isReceipt
        ? "Transactional financial mail should be retained and labeled."
        : "Message has a clear category and can be labeled automatically.",
    source: "heuristic",
    unsubscribeUrl: email.unsubscribeUrl
  };
}

export function sanitizeDecision(decision: ModelDecision, email: EmailRecord): AiDecision {
  const modelLabels = Array.isArray(decision.labels) ? decision.labels : [];
  const labels = modelLabels.filter((label): label is LabelName => labelPool.includes(label));
  const action: AiDecision["action"] = ["keep", "archive", "delete", "label", "unsubscribe"].includes(decision.action)
    ? decision.action
    : "keep";
  const unsubscribeUrl =
    decision.unsubscribeUrl && decision.unsubscribeUrl === email.unsubscribeUrl ? decision.unsubscribeUrl : email.unsubscribeUrl;
  return {
    emailId: email.id,
    action,
    labels,
    confidence: Math.max(0, Math.min(1, Number(decision.confidence) || 0)),
    reason: decision.reason || "No model reason provided.",
    source: "model",
    unsubscribeUrl
  };
}

export async function classifyEmails(
  settings: Settings,
  emails: EmailRecord[],
  automationTools: AutomationTool[] = [],
  eventSink?: CleanupEventSink
): Promise<AiDecision[]> {
  if (!settings.openAiApiKey) {
    emit(eventSink, "log", "OpenAI API key is empty; using local heuristic decisions.");
    return emails.map((email) => heuristicDecision(email, automationTools));
  }

  try {
    const client = new OpenAI({
      apiKey: settings.openAiApiKey,
      baseURL: settings.openAiBaseUrl.replace(/\/$/, "")
    });

    const { tools: mcpOpenAiTools, toolNameMap } = toMcpOpenAiTools(automationTools);
    const tools = [...aiTools, ...mcpOpenAiTools];
    emit(eventSink, "log", `Sending ${emails.length} emails to ${settings.openAiModel} with ${tools.length} tool(s) attached.`);
    const messages: ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: cleanupSystemPrompt.trim()
        },
        {
          role: "user",
          content: JSON.stringify({
            policy: {
              dryRun: settings.dryRun,
              backupDeletedEmails: settings.backupDeletedEmails,
              autoLabelEnabled: settings.autoLabelEnabled
            },
            automationTools: automationTools.map((tool) => ({
              id: tool.id,
              enabled: tool.enabled,
              connected: tool.connected,
              provider: tool.provider
            })),
            emails
          })
        }
      ];

    const firstCompletion = await requestCompletion(client, settings.openAiModel, tools, messages, eventSink);

    let completion = firstCompletion;
    for (let step = 0; step < 3; step += 1) {
      if (!completion.toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: completion.content || null,
        tool_calls: completion.toolCalls
      });
      for (const toolCall of completion.toolCalls) {
        if (toolCall.type !== "function") continue;
        if (toolCall.function.name === "query_email_decision_history") {
          emit(eventSink, "log", "Running SQL decision-history tool.");
          const history = await queryDecisionHistory(parseToolArgs(toolCall.function.arguments));
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ history })
          });
          continue;
        }

        const mcpTool = toolNameMap.get(toolCall.function.name);
        if (!mcpTool?.mcpName) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool ${toolCall.function.name}` })
          });
          continue;
        }

        const result = await callMcpTool(settings, mcpTool.mcpName, parseGenericToolArgs(toolCall.function.arguments));
        emit(eventSink, "log", `Ran MCP tool ${mcpTool.mcpName}.`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ result })
        });
      }

      completion = await requestCompletion(client, settings.openAiModel, tools, messages, eventSink);
    }

    const content = completion.content;
    if (!content) throw new Error("OpenAI-compatible API returned no content");
    emit(eventSink, "model_result", "Model response completed.", { content });
    const parsed = JSON.parse(content) as { decisions?: ModelDecision[] };
    const decisions = parsed.decisions ?? [];
    emit(eventSink, "log", `Parsed ${decisions.length} model decision(s).`);
    return emails.map((email) => {
      const decision = decisions.find((item) => item.emailId === email.id);
      return decision
        ? sanitizeDecision(decision, email)
        : {
            ...heuristicDecision(email, automationTools),
            source: "model-fallback",
            reason: "Model omitted this email; heuristic fallback applied."
          };
    });
  } catch (error) {
    emit(eventSink, "error", `OpenAI client fallback used: ${(error as Error).message}`);
    return emails.map((email) => ({
      ...heuristicDecision(email, automationTools),
      source: "model-fallback",
      reason: `${heuristicDecision(email, automationTools).reason} OpenAI client fallback used: ${(error as Error).message}`
    }));
  }
}
