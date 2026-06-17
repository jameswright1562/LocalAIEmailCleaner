import { Archive, MailCheck, Play, Tag, Trash2, WandSparkles } from "lucide-react";
import { Button, Spinner, cx } from "./Controls";
import { LabelChip, StatusChip } from "./Chips";
import { AiDecision, AppState, CleanupRun, CleanupStreamEvent, EmailRecord } from "../types";

type Props = {
  state: AppState;
  selectedId: string;
  running: boolean;
  runEvents: CleanupStreamEvent[];
  modelOutput: string;
  liveRun: CleanupRun | null;
  emailTotal: number;
  hasMoreEmails: boolean;
  loadingEmails: boolean;
  onSelect: (id: string) => void;
  onRun: () => void;
  onLoadMoreEmails: () => void;
};

function decisionChipText(decision: AiDecision): string {
  if (decision.source === "model") return `${Math.round(decision.confidence * 100)}% AI`;
  if (decision.source === "model-fallback") return "Fallback";
  return "Rule";
}

function decisionSourceText(decision?: AiDecision): string {
  if (!decision) return "Not classified";
  if (decision.source === "model") return "AI model";
  if (decision.source === "model-fallback") return "Rule fallback after model error";
  return "Local rules";
}

export function Dashboard({
  state,
  selectedId,
  running,
  runEvents,
  modelOutput,
  liveRun,
  emailTotal,
  hasMoreEmails,
  loadingEmails,
  onSelect,
  onRun,
  onLoadMoreEmails
}: Props) {
  const activeAccount = state.settings.gmailAccounts.find((account) => account.id === state.settings.activeGmailAccountId);
  const emails = state.settings.activeGmailAccountId
    ? state.emails.filter((email) => email.accountId === state.settings.activeGmailAccountId)
    : state.emails;
  const selected = emails.find((email) => email.id === selectedId) ?? emails[0];
  const decision = state.decisions.find((item) => item.emailId === selected?.id);
  const lastRun = liveRun ?? state.runs[0];
  const metrics = [
    { label: "Emails scanned", value: lastRun?.scanned ?? emailTotal },
    { label: "Deletions queued", value: lastRun?.deleted ?? 0 },
    { label: "Labels applied", value: lastRun?.labeled ?? emails.reduce((total, email) => total + email.labels.length, 0) },
    { label: "Unsubscribes ready", value: emails.filter((email) => email.unsubscribeUrl).length }
  ];

  return (
    <section className="mx-auto grid max-w-7xl gap-5">
      <header className="flex items-center justify-between gap-4 max-[620px]:flex-col max-[620px]:items-stretch">
        <div>
          <h1 className="text-3xl font-bold leading-10 tracking-normal text-slate-950 max-[620px]:text-2xl">
            Inbox cleanup
          </h1>
          <p className="text-slate-500">{activeAccount?.email || "No Gmail account connected"}</p>
        </div>
        <Button disabled={running} loading={running} onClick={onRun}>
          <Play size={16} />
          {running ? "Running" : "Run cleanup"}
        </Button>
      </header>

      <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2">
        {metrics.map((metric) => (
          <div className="rounded-xl border border-slate-200 bg-white p-4" key={metric.label}>
            <span className="text-sm text-slate-500">{metric.label}</span>
            <strong className="mt-2 block text-3xl leading-8 text-indigo-950">{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(220px,0.32fr)_1fr] items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-indigo-900/5 max-[980px]:grid-cols-1">
        <div>
          <strong className="block text-slate-950">{running ? "Cleanup in progress" : "Cleanup pipeline ready"}</strong>
          <span className="text-sm text-slate-500">Backup, classify, label, unsubscribe</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-indigo-100">
          <span
            className={cx(
              "block h-full w-2/3 rounded-full bg-gradient-to-r from-teal-600 to-cyan-400",
              running && "animate-pulse"
            )}
          />
        </div>
      </div>

      {(running || runEvents.length > 0 || modelOutput) ? (
        <div className="grid gap-3.5 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-lg shadow-indigo-900/5">
          <div className="flex min-h-12 items-center justify-between gap-3">
            <strong className="inline-flex items-center gap-2 text-slate-950">
              {running ? <Spinner /> : null}
              Live cleanup stream
            </strong>
            <StatusChip tone={running ? "warn" : "good"}>{running ? "Streaming" : "Complete"}</StatusChip>
          </div>
          <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] gap-3.5 max-[980px]:grid-cols-1">
            <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50">
              <h2 className="border-b border-slate-200 px-3 py-2.5 text-xs font-extrabold uppercase tracking-normal text-slate-500">
                Model output and reasoning
              </h2>
              <pre className="max-h-80 min-h-44 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-5 text-slate-800">
                {modelOutput || "Waiting for model output or decision reasoning..."}
              </pre>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50">
              <h2 className="border-b border-slate-200 px-3 py-2.5 text-xs font-extrabold uppercase tracking-normal text-slate-500">
                Backend logs
              </h2>
              <ol className="grid max-h-80 gap-2 overflow-auto p-3">
                {runEvents
                  .filter((event) => event.type !== "model_delta")
                  .slice(-24)
                  .map((event, index) => (
                    <li
                      className={cx(
                        "grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2 text-[13px] leading-5",
                        event.type === "error"
                          ? "text-rose-700"
                          : event.type === "run" || event.type === "model_result"
                            ? "font-bold text-teal-700"
                            : "text-slate-700"
                      )}
                      key={`${event.at}-${index}`}
                    >
                      <time className="font-mono text-slate-500">{new Date(event.at).toLocaleTimeString()}</time>
                      <span className="break-words">{event.message}</span>
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[560px] grid-cols-[minmax(360px,0.95fr)_minmax(420px,1.05fr)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-indigo-900/5 max-[980px]:min-h-0 max-[980px]:grid-cols-1">
        <EmailList
          decisions={state.decisions}
          emails={emails}
          hasMore={hasMoreEmails}
          loading={loadingEmails}
          selectedId={selected?.id}
          total={emailTotal}
          onLoadMore={onLoadMoreEmails}
          onSelect={onSelect}
        />
        {selected ? <EmailDetail email={selected} decision={decision} state={state} /> : null}
      </div>
    </section>
  );
}

function EmailList({
  emails,
  selectedId,
  onSelect,
  decisions,
  total,
  hasMore,
  loading,
  onLoadMore
}: {
  emails: EmailRecord[];
  selectedId?: string;
  onSelect: (id: string) => void;
  decisions: AiDecision[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="min-w-0 border-r border-slate-200 max-[980px]:border-b max-[980px]:border-r-0">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4">
        <strong>Review queue</strong>
        <StatusChip tone="good">
          {emails.length}/{total} messages
        </StatusChip>
      </div>
      <div
        className="grid max-h-[640px] overflow-auto"
        onScroll={(event) => {
          const target = event.currentTarget;
          if (hasMore && !loading && target.scrollTop + target.clientHeight >= target.scrollHeight - 120) {
            onLoadMore();
          }
        }}
      >
        {emails.map((email) => {
          const decision = decisions.find((item) => item.emailId === email.id);
          return (
            <button
              className={cx(
                "grid w-full gap-1.5 border-b border-slate-100 bg-white px-4 py-3.5 text-left text-slate-950 transition hover:bg-indigo-50",
                selectedId === email.id && "bg-indigo-50"
              )}
              key={email.id}
              onClick={() => onSelect(email.id)}
              type="button"
            >
              <span className="flex justify-between gap-3 text-sm">
                <strong className="min-w-0 truncate">{email.from}</strong>
                <small className="shrink-0 text-slate-500">{new Date(email.receivedAt).toLocaleDateString()}</small>
              </span>
              <span className="truncate font-bold">{email.subject}</span>
              <span className="line-clamp-2 text-[13px] leading-5 text-slate-500">{email.snippet}</span>
              <span className="flex flex-wrap gap-2">
                {email.labels.map((label) => (
                  <LabelChip key={label} label={label} />
                ))}
                {decision ? (
                  <StatusChip tone={decision.source === "model" ? "good" : "warn"}>{decisionChipText(decision)}</StatusChip>
                ) : null}
              </span>
            </button>
          );
        })}
        {hasMore || loading ? (
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 font-extrabold text-indigo-700 disabled:opacity-60"
            disabled={loading}
            onClick={onLoadMore}
            type="button"
          >
            {loading ? <Spinner /> : null}
            {loading ? "Loading more emails" : "Load more emails"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmailDetail({ email, decision, state }: { email: EmailRecord; decision?: AiDecision; state: AppState }) {
  return (
    <div className="grid content-start gap-4 bg-gradient-to-b from-white to-slate-50 p-4">
      <div className="rounded-xl border border-slate-200 bg-white pb-4">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4">
          <strong className="min-w-0 break-words">{email.subject}</strong>
          <StatusChip tone={email.risk === "high" ? "danger" : email.risk === "medium" ? "warn" : "good"}>
            {email.risk} risk
          </StatusChip>
        </div>
        <p className="mt-4 px-4 text-sm text-slate-500">{email.from}</p>
        <p className="px-4 leading-6 text-slate-700">{email.snippet}</p>
        <div className="flex flex-wrap gap-2 px-4 pt-4 max-[620px]:grid">
          <Button variant="ghost">
            <Archive size={16} />
            Archive
          </Button>
          <Button variant="secondary">
            <Tag size={16} />
            Label
          </Button>
          <Button variant="danger">
            <Trash2 size={16} />
            Delete with backup
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-lg shadow-indigo-900/5">
        <div className="flex items-center gap-2 text-indigo-700">
          <WandSparkles size={18} />
          <strong>{decision?.source === "model" ? "AI plan" : "Cleanup plan"}</strong>
        </div>
        <dl className="my-4 grid gap-3.5">
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-normal text-slate-500">Source</dt>
            <dd className="mt-1 break-words leading-6">{decisionSourceText(decision)}</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-normal text-slate-500">Recommendation</dt>
            <dd className="mt-1 break-words leading-6">{decision?.action ?? "Run cleanup to classify"}</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-normal text-slate-500">Reason</dt>
            <dd className="mt-1 break-words leading-6">{decision?.reason ?? "No cleanup decision has been generated for this email yet."}</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-normal text-slate-500">Unsubscribe link</dt>
            <dd className="mt-1 break-words leading-6">{decision?.unsubscribeUrl ?? email.unsubscribeUrl ?? "Not detected"}</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-normal text-slate-500">Model</dt>
            <dd className="mt-1 break-words leading-6">{state.settings.openAiModel}</dd>
          </div>
          <div>
            <dt className="text-xs font-extrabold uppercase tracking-normal text-slate-500">Deleted mail storage</dt>
            <dd className="mt-1 break-words leading-6">{state.settings.backupDeletedEmails ? "Enabled before trashing" : "Disabled"}</dd>
          </div>
        </dl>
        {email.unsubscribeUrl ? (
          <Button variant="secondary">
            <MailCheck size={16} />
            Unsubscribe sender
          </Button>
        ) : null}
      </div>
    </div>
  );
}
