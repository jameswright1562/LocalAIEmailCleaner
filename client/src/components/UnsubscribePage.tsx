import { MailX, ShieldCheck } from "lucide-react";
import { EmailRecord, Settings } from "../types";
import { Button } from "./Controls";
import { LabelChip } from "./Chips";

type Props = {
  emails: EmailRecord[];
  settings: Settings;
  running: boolean;
  onUnsubscribeAll: () => void;
};

export function UnsubscribePage({ emails, settings, running, onUnsubscribeAll }: Props) {
  const activeAccount = settings.gmailAccounts.find((account) => account.id === settings.activeGmailAccountId);
  const accountEmails = settings.activeGmailAccountId
    ? emails.filter((email) => email.accountId === settings.activeGmailAccountId)
    : emails;
  const unsubscribeEmails = accountEmails.filter((email) => email.unsubscribeUrl);
  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h1>Full unsubscribe</h1>
          <p>Find sender links for {activeAccount?.email || "the active account"} and confirm unsubscribes through WebClaw MCP or Playwright.</p>
        </div>
        <Button disabled={running || unsubscribeEmails.length === 0} onClick={onUnsubscribeAll} variant="secondary">
          <MailX size={16} />
          {running ? "Unsubscribing" : "Unsubscribe all"}
        </Button>
      </header>
      <div className="unsubscribe-summary">
        <div className="ai-plan">
          <div className="ai-plan-title">
            <ShieldCheck size={18} />
            <strong>Confirmation policy</strong>
          </div>
          <p>
            The runner opens each detected link, declines retention offers, confirms the final unsubscribe state,
            and records the automation note in run history.
          </p>
        </div>
        <div className="panel table-panel">
          <div className="panel-heading">
            <strong>Detected senders</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sender</th>
                <th>Subject</th>
                <th>Labels</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {unsubscribeEmails.map((email) => (
                <tr key={email.id}>
                  <td>{email.from}</td>
                  <td>{email.subject}</td>
                  <td>
                    <span className="chip-row">
                      {email.labels.map((label) => (
                        <LabelChip key={label} label={label} />
                      ))}
                    </span>
                  </td>
                  <td>{email.unsubscribeUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
