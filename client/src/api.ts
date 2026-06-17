import { AppState, AutomationTool, CleanupRun, CleanupStreamEvent, EmailPage, ModelProbe, Schedule, Settings } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...init?.headers },
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    let parsed: { error?: string } | undefined;
    try {
      parsed = JSON.parse(text) as { error?: string };
    } catch {
      parsed = undefined;
    }
    throw new Error(parsed?.error ?? text);
  }
  return response.json() as Promise<T>;
}

export const api = {
  state: () => request<AppState>("/api/state"),
  emails: (accountId: string, offset = 0, limit = 50) =>
    request<EmailPage>(`/api/emails?accountId=${encodeURIComponent(accountId)}&offset=${offset}&limit=${limit}`),
  saveSettings: (settings: Settings) =>
    request<{ ok: true; settings: Settings; automationTools: AutomationTool[] }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings)
    }),
  probeTools: () =>
    request<{ ok: true; automationTools: AutomationTool[] }>("/api/tools/probe", {
      method: "POST",
      body: JSON.stringify({})
    }),
  probeModels: (settings: Settings) =>
    request<ModelProbe>("/api/models/probe", {
      method: "POST",
      body: JSON.stringify(settings)
    }),
  syncGmail: () =>
    request<{ ok: true; accountId: string; count: number }>("/api/gmail/sync", {
      method: "POST",
      body: JSON.stringify({})
    }),
  gmailAuthUrl: () =>
    request<{ ok: true; authUrl: string }>("/api/gmail/oauth/url", {
      method: "POST",
      body: JSON.stringify({})
    }),
  runCleanup: (mode: CleanupRun["mode"] = "manual") =>
    request<CleanupRun>("/api/cleanup/run", {
      method: "POST",
      body: JSON.stringify({ mode })
    }),
  runCleanupStream: async (mode: CleanupRun["mode"], onEvent: (event: CleanupStreamEvent) => void) => {
    const response = await fetch("/api/cleanup/run/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode })
    });
    if (!response.ok || !response.body) {
      throw new Error(await response.text());
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        onEvent(JSON.parse(dataLine.slice(6)) as CleanupStreamEvent);
      }
    }
  },
  unsubscribeAll: () =>
    request<CleanupRun>("/api/unsubscribe/all", {
      method: "POST",
      body: JSON.stringify({})
    }),
  saveSchedule: (schedule: Schedule) =>
    request<{ ok: true; schedule: Schedule }>("/api/schedules", {
      method: "POST",
      body: JSON.stringify(schedule)
    }),
  deleteSchedule: (id: string) =>
    request<{ ok: true }>(`/api/schedules/${id}`, {
      method: "DELETE"
    })
};
