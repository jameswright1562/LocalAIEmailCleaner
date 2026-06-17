import { Archive, MailCheck, Play, Tag, Trash2, WandSparkles } from "lucide-react";
import { Button } from "./Controls";
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
    <section className="page-grid dashboard-grid">
      <header className="page-header">
        <div>
          <h1>Inbox cleanup</h1>
          <p>{activeAccount?.email || "No Gmail account connected"}</p>
        </div>
        <Button disabled={running} onClick={onRun}>
          <Play size={16} />
          {running ? "Running" : "Run cleanup"}
        </Button>
      </header>

      <div className="metrics-strip">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="progress-panel">
        <div>
          <strong>{running ? "Cleanup in progress" : "Cleanup pipeline ready"}</strong>
          <span>Backup, classify, label, unsubscribe</span>
        </div>
        <div className={`progress-track ${running ? "active" : ""}`}>
          <span />
        </div>
      </div>

      {(running || runEvents.length > 0 || modelOutput) ? (
        <div className="live-run-panel">
          <div className="panel-heading">
            <strong>Live cleanup stream</strong>
            <StatusChip tone={running ? "warn" : "good"}>{running ? "Streaming" : "Complete"}</StatusChip>
          </div>
          <div className="live-run-grid">
            <div>
              <h2>Model output and reasoning</h2>
              <pre>{modelOutput || "Waiting for model output or decision reasoning..."}</pre>
            </div>
            <div>
              <h2>Backend logs</h2>
              <ol>
                {runEvents
                  .filter((event) => event.type !== "model_delta")
                  .slice(-24)
                  .map((event, index) => (
                    <li className={event.type} key={`${event.at}-${index}`}>
                      <time>{new Date(event.at).toLocaleTimeString()}</time>
                      <span>{event.message}</span>
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        </div>
      ) : null}

      <div className="master-detail">
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
    <div className="panel email-list-panel">
      <div className="panel-heading">
        <strong>Review queue</strong>
        <StatusChip tone="good">
          {emails.length}/{total} messages
        </StatusChip>
      </div>
      <div
        className="email-list"
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
              className={`email-row ${selectedId === email.id ? "selected" : ""}`}
              key={email.id}
              onClick={() => onSelect(email.id)}
              type="button"
            >
              <span className="email-row-top">
                <strong>{email.from}</strong>
                <small>{new Date(email.receivedAt).toLocaleDateString()}</small>
              </span>
              <span className="email-subject">{email.subject}</span>
              <span className="email-snippet">{email.snippet}</span>
              <span className="chip-row">
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
          <button className="load-more-row" disabled={loading} onClick={onLoadMore} type="button">
            {loading ? "Loading more emails" : "Load more emails"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmailDetail({ email, decision, state }: { email: EmailRecord; decision?: AiDecision; state: AppState }) {
  return (
    <div className="detail-pane">
      <div className="panel email-detail">
        <div className="panel-heading">
          <strong>{email.subject}</strong>
          <StatusChip tone={email.risk === "high" ? "danger" : email.risk === "medium" ? "warn" : "good"}>
            {email.risk} risk
          </StatusChip>
        </div>
        <p className="email-from">{email.from}</p>
        <p>{email.snippet}</p>
        <div className="action-row">
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

      <div className="ai-plan">
        <div className="ai-plan-title">
          <WandSparkles size={18} />
          <strong>{decision?.source === "model" ? "AI plan" : "Cleanup plan"}</strong>
        </div>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{decisionSourceText(decision)}</dd>
          </div>
          <div>
            <dt>Recommendation</dt>
            <dd>{decision?.action ?? "Run cleanup to classify"}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{decision?.reason ?? "No cleanup decision has been generated for this email yet."}</dd>
          </div>
          <div>
            <dt>Unsubscribe link</dt>
            <dd>{decision?.unsubscribeUrl ?? email.unsubscribeUrl ?? "Not detected"}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{state.settings.openAiModel}</dd>
          </div>
          <div>
            <dt>Deleted mail storage</dt>
            <dd>{state.settings.backupDeletedEmails ? "Enabled before trashing" : "Disabled"}</dd>
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
