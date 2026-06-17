import { useEffect, useState } from "react";
import { api } from "./api";
import { Dashboard } from "./components/Dashboard";
import { HistoryPage } from "./components/HistoryPage";
import { Page, Sidebar } from "./components/Sidebar";
import { Schedules } from "./components/Schedules";
import { SettingsPage } from "./components/SettingsPage";
import { UnsubscribePage } from "./components/UnsubscribePage";
import { AppState, CleanupRun, CleanupStreamEvent, Schedule, Settings } from "./types";
import "./styles/app.css";

const emailPageSize = 50;

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [state, setState] = useState<AppState | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState("");
  const [running, setRunning] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; tone: "info" | "error" | "success" }[]>([]);
  const [runEvents, setRunEvents] = useState<CleanupStreamEvent[]>([]);
  const [modelOutput, setModelOutput] = useState("");
  const [liveRun, setLiveRun] = useState<CleanupRun | null>(null);
  const [emailTotal, setEmailTotal] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);

  function pushToast(message: string, tone: "info" | "error" | "success" = "info") {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-4), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }

  async function refresh() {
    const nextState = await api.state();
    setState(nextState);
    const accountId = nextState.settings.activeGmailAccountId;
    if (accountId) {
      const page = await api.emails(accountId, 0, emailPageSize);
      const stateWithEmails = { ...nextState, emails: page.emails };
      setState(stateWithEmails);
      setEmailTotal(page.total);
      setHasMoreEmails(page.hasMore);
      setSelectedEmailId((current) => (page.emails.some((email) => email.id === current) ? current : page.emails[0]?.id || ""));
    } else {
      setEmailTotal(0);
      setHasMoreEmails(false);
      setSelectedEmailId("");
    }
  }

  async function loadMoreEmails() {
    if (!state?.settings.activeGmailAccountId || loadingEmails || !hasMoreEmails) return;
    setLoadingEmails(true);
    try {
      const page = await api.emails(state.settings.activeGmailAccountId, state.emails.length, emailPageSize);
      setState((current) => (current ? { ...current, emails: [...current.emails, ...page.emails] } : current));
      setEmailTotal(page.total);
      setHasMoreEmails(page.hasMore);
    } catch (error) {
      pushToast((error as Error).message, "error");
    } finally {
      setLoadingEmails(false);
    }
  }

  useEffect(() => {
    refresh().catch((error) => pushToast(error.message, "error"));
  }, []);

  async function withRefresh(action: () => Promise<unknown>, done: string) {
    setRunning(true);
    try {
      await action();
      await refresh();
      pushToast(done, "success");
    } catch (error) {
      pushToast((error as Error).message, "error");
    } finally {
      setRunning(false);
    }
  }

  function saveSettings(settings: Settings) {
    void withRefresh(() => api.saveSettings(settings), "Settings saved.");
  }

  function probeTools() {
    void withRefresh(() => api.probeTools(), "Automation tools refreshed.");
  }

  function syncGmail(settings: Settings) {
    void withRefresh(async () => {
      await api.saveSettings(settings);
      await api.syncGmail();
    }, "Gmail inbox synced.");
  }

  function connectGmail(settings: Settings) {
    void withRefresh(async () => {
      await api.saveSettings(settings);
      const result = await api.gmailAuthUrl();
      window.open(result.authUrl, "_blank", "noopener,noreferrer");
    }, "Google consent opened. Return here after approving access.");
  }

  function saveSchedule(schedule: Schedule) {
    void withRefresh(() => api.saveSchedule(schedule), "Schedule saved.");
  }

  function deleteSchedule(id: string) {
    void withRefresh(() => api.deleteSchedule(id), "Schedule deleted.");
  }

  function runCleanup(mode: CleanupRun["mode"] = "manual") {
    setRunning(true);
    setRunEvents([]);
    setModelOutput("");
    setLiveRun(null);
    pushToast("Cleanup run started.", "info");
    void api
      .runCleanupStream(mode, (event) => {
        setRunEvents((current) => [...current.slice(-499), event]);
        if (event.type === "model_delta") {
          setModelOutput((current) => `${current}${event.message}`.slice(-60000));
        }
        if (event.type === "model_result") {
          const content =
            event.data && typeof event.data === "object" && "content" in event.data
              ? String((event.data as { content?: unknown }).content ?? "")
              : "";
          if (content) {
            setModelOutput((current) => `${current}\n\nRaw model response:\n${content}\n`.slice(-60000));
          }
          pushToast("Model response completed.", "success");
        }
        if (event.type === "reasoning") {
          const content =
            event.data && typeof event.data === "object" && "content" in event.data
              ? String((event.data as { content?: unknown }).content ?? "")
              : event.message;
          setModelOutput((current) => `${current}\n\n${event.message}\n${content}\n`.slice(-60000));
        }
        if (event.type === "log" && event.message.startsWith("Classifying batch")) {
          pushToast(event.message, "info");
        }
        if (event.type === "run") {
          if (event.data && typeof event.data === "object") {
            setLiveRun(event.data as CleanupRun);
          }
          if ((event.data as CleanupRun | undefined)?.status === "completed") {
            pushToast("Cleanup run completed.", "success");
          }
        }
        if (event.type === "error") {
          pushToast(event.message, "error");
        }
      })
      .then(refresh)
      .catch((error: Error) => pushToast(error.message, "error"))
      .finally(() => setRunning(false));
  }

  function unsubscribeAll() {
    void withRefresh(() => api.unsubscribeAll(), "Unsubscribe run completed.");
  }

  if (!state) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">AI</div>
        <span>Loading local inbox state</span>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} onPageChange={setPage} />
      <main className="content-shell">
        {page === "dashboard" ? (
          <Dashboard
            emailTotal={emailTotal}
            hasMoreEmails={hasMoreEmails}
            loadingEmails={loadingEmails}
            modelOutput={modelOutput}
            liveRun={liveRun}
            runEvents={runEvents}
            running={running}
            selectedId={selectedEmailId}
            state={state}
            onLoadMoreEmails={loadMoreEmails}
            onRun={() => runCleanup("manual")}
            onSelect={setSelectedEmailId}
          />
        ) : null}
        {page === "scheduled" ? (
          <Schedules schedules={state.schedules} onSave={saveSchedule} onDelete={deleteSchedule} />
        ) : null}
        {page === "history" ? <HistoryPage runs={state.runs} /> : null}
        {page === "unsubscribe" ? (
          <UnsubscribePage emails={state.emails} settings={state.settings} running={running} onUnsubscribeAll={unsubscribeAll} />
        ) : null}
        {page === "settings" ? (
          <SettingsPage
            automationTools={state.automationTools}
            settings={state.settings}
            onProbeTools={probeTools}
            onSave={saveSettings}
            onConnectGmail={connectGmail}
            onSyncGmail={syncGmail}
          />
        ) : null}
      </main>
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
