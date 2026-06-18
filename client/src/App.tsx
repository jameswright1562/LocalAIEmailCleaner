import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "./api";
import { Dashboard } from "./components/Dashboard";
import { HistoryPage } from "./components/HistoryPage";
import { Page, Sidebar } from "./components/Sidebar";
import { Schedules } from "./components/Schedules";
import { SettingsPage } from "./components/SettingsPage";
import { UnsubscribePage } from "./components/UnsubscribePage";
import { useCleanupStream } from "./hooks/useCleanupStream";
import { AiDecision, AppState, LabelName, Schedule, Settings } from "./types";
import "./styles/app.css";
import { Button, Spinner } from "./components/Controls";

const emailPageSize = 50;
const pages: Page[] = ["dashboard", "scheduled", "history", "unsubscribe", "settings"];

function pageFromHash(): Page {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return (pages as string[]).includes(hash) ? (hash as Page) : "dashboard";
}

type ToastTone = "info" | "error" | "success";

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [state, setState] = useState<AppState | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState("");
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; tone: ToastTone }[]>([]);
  const [emailTotal, setEmailTotal] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [lastError, setLastError] = useState("");

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    if (tone === "error") setLastError(message);
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-4), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }, []);

  const refresh = useCallback(async () => {
    const nextState = await api.state();
    setState(nextState);
    const accountId = nextState.settings.activeGmailAccountId;
    if (accountId) {
      const emailPage = await api.emails(accountId, 0, emailPageSize);
      setState({ ...nextState, emails: emailPage.emails });
      setEmailTotal(emailPage.total);
      setHasMoreEmails(emailPage.hasMore);
      setSelectedEmailId((current) =>
        emailPage.emails.some((email) => email.id === current) ? current : emailPage.emails[0]?.id || ""
      );
    } else {
      setEmailTotal(0);
      setHasMoreEmails(false);
      setSelectedEmailId("");
    }
  }, []);

  const cleanup = useCleanupStream({
    onToast: pushToast,
    onStart: () => setLastError(""),
    afterRun: refresh
  });

  useEffect(() => {
    refresh().catch((error: Error) => pushToast(error.message, "error"));
  }, [refresh, pushToast]);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Page) => {
    window.location.hash = `#/${next}`;
    setPage(next);
  }, []);

  async function loadMoreEmails() {
    if (!state?.settings.activeGmailAccountId || loadingEmails || !hasMoreEmails) return;
    setLoadingEmails(true);
    try {
      const emailPage = await api.emails(state.settings.activeGmailAccountId, state.emails.length, emailPageSize);
      setState((current) => (current ? { ...current, emails: [...current.emails, ...emailPage.emails] } : current));
      setEmailTotal(emailPage.total);
      setHasMoreEmails(emailPage.hasMore);
    } catch (error) {
      pushToast((error as Error).message, "error");
    } finally {
      setLoadingEmails(false);
    }
  }

  async function withRefresh(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setLastError("");
    try {
      await action();
      await refresh();
      pushToast(done, "success");
    } catch (error) {
      pushToast((error as Error).message, "error");
    } finally {
      setBusy(false);
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

  function unsubscribeAll() {
    void withRefresh(() => api.unsubscribeAll(), "Unsubscribe run completed.");
  }

  function emailAction(id: string, action: AiDecision["action"], labels?: LabelName[]) {
    void withRefresh(() => api.emailAction(id, action, labels), `Email ${action} applied.`);
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">
        <div className="grid place-items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-700 text-white shadow-sm shadow-indigo-900/20">AI</div>
          <span className="inline-flex items-center gap-2 font-bold">
            <Spinner />
            Loading local inbox state
          </span>
        </div>
      </main>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] bg-slate-50 max-[980px]:grid-cols-1">
      <Sidebar page={page} onPageChange={navigate} />
      <main className="min-w-0 p-7 max-[980px]:p-4">
        {lastError ? <ErrorBanner message={lastError} onDismiss={() => setLastError("")} /> : null}
        {page === "dashboard" ? (
          <Dashboard
            emailTotal={emailTotal}
            hasMoreEmails={hasMoreEmails}
            loadingEmails={loadingEmails}
            modelOutput={cleanup.modelOutput}
            liveRun={cleanup.liveRun}
            reasoningTrace={cleanup.reasoningTrace}
            runEvents={cleanup.runEvents}
            running={cleanup.running}
            actionBusy={busy}
            selectedId={selectedEmailId}
            state={state}
            onLoadMoreEmails={loadMoreEmails}
            onRun={() => cleanup.runCleanup("manual")}
            onSelect={setSelectedEmailId}
            onEmailAction={emailAction}
          />
        ) : null}
        {page === "scheduled" ? (
          <Schedules schedules={state.schedules} onSave={saveSchedule} onDelete={deleteSchedule} />
        ) : null}
        {page === "history" ? <HistoryPage runs={state.runs} /> : null}
        {page === "unsubscribe" ? (
          <UnsubscribePage emails={state.emails} settings={state.settings} running={busy} onUnsubscribeAll={unsubscribeAll} />
        ) : null}
        {page === "settings" ? (
          <SettingsPage
            automationTools={state.automationTools}
            busy={busy}
            settings={state.settings}
            onProbeTools={probeTools}
            onSave={saveSettings}
            onConnectGmail={connectGmail}
            onSyncGmail={syncGmail}
          />
        ) : null}
      </main>
      <div
        className="fixed bottom-6 right-6 z-10 grid w-[min(420px,calc(100vw-48px))] gap-2.5"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            className={`rounded-lg border bg-white/95 px-3.5 py-3 font-bold shadow-lg backdrop-blur ${
              toast.tone === "error"
                ? "border-rose-300 text-rose-700"
                : toast.tone === "success"
                  ? "border-teal-300 text-teal-800"
                  : "border-slate-200 text-slate-800"
            }`}
            key={toast.id}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mx-auto mb-4 flex max-w-7xl items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div className="min-w-0 flex-1">
        <strong className="block text-sm">Something needs attention</strong>
        <p className="break-words text-sm leading-5">{message}</p>
      </div>
      <Button variant="ghost" onClick={onDismiss}>
        <X size={16} />
        Dismiss
      </Button>
    </div>
  );
}
