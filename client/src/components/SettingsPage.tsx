import { KeyRound, MailCheck, Plus, PlugZap, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { AutomationTool, GmailAccount, ModelProbe, Settings } from "../types";
import { Button, Field, Spinner, Toggle, cx } from "./Controls";
import { StatusChip } from "./Chips";

const googleRedirectUri = "http://127.0.0.1:8787/api/gmail/oauth/callback";

type Props = {
  settings: Settings;
  busy: boolean;
  automationTools: AutomationTool[];
  onSave: (settings: Settings) => void;
  onProbeTools: () => void;
  onConnectGmail: (settings: Settings) => void;
  onSyncGmail: (settings: Settings) => void;
};

export function SettingsPage({ settings, busy, automationTools, onSave, onProbeTools, onConnectGmail, onSyncGmail }: Props) {
  const [draft, setDraft] = useState(settings);
  const [modelProbe, setModelProbe] = useState<ModelProbe | null>(null);
  useEffect(() => setDraft(settings), [settings]);
  const activeAccount = draft.gmailAccounts.find((account) => account.id === draft.activeGmailAccountId);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void api.probeModels(draft).then(setModelProbe).catch((error: Error) => {
        setModelProbe({ ok: false, baseUrl: draft.openAiBaseUrl, models: [], error: error.message });
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [draft.openAiBaseUrl, draft.openAiApiKey, draft.openAiModel]);

  function updateAccount(nextAccount: GmailAccount) {
    setDraft({
      ...draft,
      activeGmailAccountId: nextAccount.id,
      gmailAccounts: draft.gmailAccounts.map((account) => (account.id === nextAccount.id ? nextAccount : account))
    });
  }

  function addAccount() {
    const account: GmailAccount = {
      id: crypto.randomUUID(),
      email: "",
      clientId: "",
      clientSecret: "",
      refreshToken: ""
    };
    setDraft({
      ...draft,
      activeGmailAccountId: account.id,
      gmailAccounts: [...draft.gmailAccounts, account]
    });
  }

  function removeActiveAccount() {
    if (!activeAccount) return;
    const gmailAccounts = draft.gmailAccounts.filter((account) => account.id !== activeAccount.id);
    setDraft({
      ...draft,
      gmailAccounts,
      activeGmailAccountId: gmailAccounts[0]?.id ?? ""
    });
  }

  const clientIdLooksValid = !activeAccount?.clientId || activeAccount.clientId.trim().endsWith(".apps.googleusercontent.com");
  const clientSecretSuffix = activeAccount?.clientSecret.trim()
    ? activeAccount.clientSecret.trim().slice(-4)
    : "";

  return (
    <section className="mx-auto grid max-w-7xl gap-5">
      <header className="flex items-center justify-between gap-4 max-[620px]:flex-col max-[620px]:items-stretch">
        <div>
          <h1 className="text-3xl font-bold leading-10 tracking-normal text-slate-950 max-[620px]:text-2xl">Settings</h1>
          <p className="text-slate-500">Configure Gmail, OpenAI-compatible inference, storage, and browser automation.</p>
        </div>
        <Button loading={busy} onClick={() => onSave(draft)}>
          <Save size={16} />
          Save settings
        </Button>
      </header>
      <div className="grid grid-cols-3 items-start gap-4 max-[980px]:grid-cols-1">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white px-4 pb-4">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200">
            <strong>Google accounts</strong>
          </div>
          <div className="grid gap-2">
            {draft.gmailAccounts.map((account) => (
              <button
                className={cx(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left",
                  account.id === draft.activeGmailAccountId
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-950"
                )}
                key={account.id}
                onClick={() => setDraft({ ...draft, activeGmailAccountId: account.id })}
                type="button"
              >
                <strong>{account.email || "Untitled Gmail account"}</strong>
                <span className="text-xs font-extrabold text-slate-500">{account.id === draft.activeGmailAccountId ? "Active" : "Available"}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={addAccount}>
            <Plus size={16} />
            Add account
          </Button>
          {activeAccount ? (
            <>
              <Field label="Gmail address" value={activeAccount.email} onChange={(email) => updateAccount({ ...activeAccount, email })} />
              <Field
                label="OAuth client ID"
                value={activeAccount.clientId}
                onChange={(clientId) => updateAccount({ ...activeAccount, clientId })}
              />
              {!clientIdLooksValid ? (
                <div className="grid gap-1.5 rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <strong>OAuth client ID looks incomplete</strong>
                  <span className="text-sm leading-5 text-slate-600">
                    It should usually end with .apps.googleusercontent.com. Copy the Client ID from Credentials, not the numeric project ID.
                  </span>
                </div>
              ) : null}
              <Field
                label="OAuth client secret"
                type="password"
                value={activeAccount.clientSecret}
                onChange={(clientSecret) => updateAccount({ ...activeAccount, clientSecret })}
              />
              {clientSecretSuffix ? <p className="-mt-2 text-sm font-bold text-slate-500">Saved secret ends with {clientSecretSuffix}</p> : null}
              <div className="grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <strong>Authorized redirect URI</strong>
                <code className="break-words rounded-lg bg-indigo-50 p-2 text-xs font-extrabold text-indigo-700">{googleRedirectUri}</code>
                <span className="text-sm leading-5 text-slate-500">Add this under Credentials / OAuth client / Authorized redirect URIs. Do not put it in Authorized domains.</span>
              </div>
              <Field
                label="Refresh token"
                type="password"
                value={activeAccount.refreshToken}
                onChange={(refreshToken) => updateAccount({ ...activeAccount, refreshToken })}
              />
              <Button loading={busy} variant="ghost" onClick={() => onConnectGmail(draft)}>
                <KeyRound size={16} />
                Connect Google
              </Button>
              <Button loading={busy} variant="secondary" onClick={() => onSyncGmail(draft)}>
                <MailCheck size={16} />
                Sync Gmail inbox
              </Button>
              <Button variant="danger" onClick={removeActiveAccount}>
                <Trash2 size={16} />
                Remove active account
              </Button>
            </>
          ) : (
            <p className="text-slate-500">No Google account configured. Add one to enable Gmail cleanup.</p>
          )}
        </div>
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white px-4 pb-4">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200">
            <strong>OpenAI-compatible model</strong>
          </div>
          <Field label="Base URL" value={draft.openAiBaseUrl} onChange={(openAiBaseUrl) => setDraft({ ...draft, openAiBaseUrl })} />
          <Field label="API key" type="password" value={draft.openAiApiKey} onChange={(openAiApiKey) => setDraft({ ...draft, openAiApiKey })} />
          <Field label="Model" value={draft.openAiModel} onChange={(openAiModel) => setDraft({ ...draft, openAiModel })} />
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <strong>/v1/models</strong>
              <span className="mt-1 flex items-center gap-2 break-words text-sm leading-5 text-slate-500">
                {!modelProbe ? <Spinner /> : null}
                {modelProbe ? (modelProbe.ok ? `${modelProbe.models.length} models found` : modelProbe.error) : "Waiting for URL"}
              </span>
            </div>
            {modelProbe?.models.slice(0, 5).map((model) => (
              <button
                className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-sm font-extrabold text-indigo-700"
                key={model.id}
                onClick={() => setDraft({ ...draft, openAiModel: model.id })}
                type="button"
              >
                {model.id}
              </button>
            ))}
          </div>
          <Field
            label="MCP stdio command"
            value={draft.mcpStdioCommand}
            onChange={(mcpStdioCommand) => setDraft({ ...draft, mcpStdioCommand })}
            placeholder="npx"
          />
          <Field
            label="MCP stdio args"
            value={draft.mcpStdioArgs}
            onChange={(mcpStdioArgs) => setDraft({ ...draft, mcpStdioArgs })}
            placeholder="-y @vendor/webclaw-mcp"
          />
          <Field
            label="MCP working directory"
            value={draft.mcpStdioCwd}
            onChange={(mcpStdioCwd) => setDraft({ ...draft, mcpStdioCwd })}
            placeholder="Optional"
          />
          <Toggle
            label="Enable stdio MCP tools"
            description="Starts the configured MCP server over stdio and registers discovered unsubscribe/browser tools."
            checked={draft.webclawEnabled}
            onChange={(webclawEnabled) => setDraft({ ...draft, webclawEnabled })}
          />
          <Toggle
            label="Enable Playwright fallback"
            description="Registers local browser automation when WebClaw is unavailable."
            checked={draft.playwrightEnabled}
            onChange={(playwrightEnabled) => setDraft({ ...draft, playwrightEnabled })}
          />
          <Toggle
            label="Auto-register automation tools"
            description="Adds connected WebClaw and Playwright tools into cleanup runs and AI policy context."
            checked={draft.autoRegisterAutomationTools}
            onChange={(autoRegisterAutomationTools) => setDraft({ ...draft, autoRegisterAutomationTools })}
          />
          <Button loading={busy} variant="ghost" onClick={onProbeTools}>
            <PlugZap size={16} />
            Probe tools
          </Button>
        </div>
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white px-4 pb-4">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200">
            <strong>Automation policy</strong>
          </div>
          <Toggle
            label="Back up deleted emails"
            description="Write a local JSON copy before Gmail trash/delete operations."
            checked={draft.backupDeletedEmails}
            onChange={(backupDeletedEmails) => setDraft({ ...draft, backupDeletedEmails })}
          />
          <Toggle
            label="Auto label emails"
            description="Apply categories such as Job, Holiday, Finance, and Newsletter."
            checked={draft.autoLabelEnabled}
            onChange={(autoLabelEnabled) => setDraft({ ...draft, autoLabelEnabled })}
          />
          <Toggle
            label="Dry run"
            description="Classify and record actions without mutating Gmail or submitting unsubscribe pages."
            checked={draft.dryRun}
            onChange={(dryRun) => setDraft({ ...draft, dryRun })}
          />
        </div>
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white px-4 pb-4">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200">
            <strong>Registered tools</strong>
          </div>
          <div className="grid gap-2.5">
            {automationTools.length === 0 ? <p className="text-slate-500">No tools have been probed yet.</p> : null}
            {automationTools.map((tool) => (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3" key={tool.id}>
                <div>
                  <strong>{tool.label}</strong>
                  <span className="mt-1 block text-sm leading-5 text-slate-500">{tool.description}</span>
                </div>
                <StatusChip tone={tool.connected ? "good" : tool.enabled ? "warn" : "neutral"}>
                  {tool.enabled ? (tool.connected ? "connected" : "enabled") : "disabled"}
                </StatusChip>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
