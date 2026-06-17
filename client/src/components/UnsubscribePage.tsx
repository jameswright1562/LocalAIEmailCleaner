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
    <section className="mx-auto grid max-w-7xl gap-5">
      <header className="flex items-center justify-between gap-4 max-[620px]:flex-col max-[620px]:items-stretch">
        <div>
          <h1 className="text-3xl font-bold leading-10 tracking-normal text-slate-950 max-[620px]:text-2xl">Full unsubscribe</h1>
          <p className="text-slate-500">
            Find sender links for {activeAccount?.email || "the active account"} and confirm unsubscribes through WebClaw MCP or Playwright.
          </p>
        </div>
        <Button disabled={unsubscribeEmails.length === 0} loading={running} onClick={onUnsubscribeAll} variant="secondary">
          <MailX size={16} />
          {running ? "Unsubscribing" : "Unsubscribe all"}
        </Button>
      </header>
      <div className="grid grid-cols-[minmax(320px,0.8fr)_minmax(480px,1.2fr)] items-start gap-4 max-[980px]:grid-cols-1">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-indigo-900/5">
          <div className="flex items-center gap-2 text-indigo-700">
            <ShieldCheck size={18} />
            <strong>Confirmation policy</strong>
          </div>
          <p className="mt-4 leading-6 text-slate-700">
            The runner opens each detected link, declines retention offers, confirms the final unsubscribe state,
            and records the automation note in run history.
          </p>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4">
            <strong>Detected senders</strong>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Sender", "Subject", "Labels", "Link"].map((heading) => (
                  <th className="border-b border-slate-100 px-4 py-3 text-left align-top text-xs font-extrabold uppercase tracking-normal text-slate-500" key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unsubscribeEmails.map((email) => (
                <tr key={email.id}>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">{email.from}</td>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">{email.subject}</td>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">
                    <span className="flex flex-wrap gap-2">
                      {email.labels.map((label) => (
                        <LabelChip key={label} label={label} />
                      ))}
                    </span>
                  </td>
                  <td className="break-words border-b border-slate-100 px-4 py-3 align-top">{email.unsubscribeUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
