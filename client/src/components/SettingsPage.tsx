import { KeyRound, MailCheck, Plus, PlugZap, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { AutomationTool, GmailAccount, ModelProbe, Settings } from "../types";
import { Button, Field, Toggle } from "./Controls";
import { StatusChip } from "./Chips";

const googleRedirectUri = "http://127.0.0.1:8787/api/gmail/oauth/callback";

type Props = {
  settings: Settings;
  automationTools: AutomationTool[];
  onSave: (settings: Settings) => void;
  onProbeTools: () => void;
  onConnectGmail: (settings: Settings) => void;
  onSyncGmail: (settings: Settings) => void;
};

export function SettingsPage({ settings, automationTools, onSave, onProbeTools, onConnectGmail, onSyncGmail }: Props) {
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
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Configure Gmail, OpenAI-compatible inference, storage, and browser automation.</p>
        </div>
        <Button onClick={() => onSave(draft)}>
          <Save size={16} />
          Save settings
        </Button>
      </header>
      <div className="settings-grid">
        <div className="panel form-panel">
          <div className="panel-heading">
            <strong>Google accounts</strong>
          </div>
          <div className="account-list">
            {draft.gmailAccounts.map((account) => (
              <button
                className={`account-row ${account.id === draft.activeGmailAccountId ? "selected" : ""}`}
                key={account.id}
                onClick={() => setDraft({ ...draft, activeGmailAccountId: account.id })}
                type="button"
              >
                <strong>{account.email || "Untitled Gmail account"}</strong>
                <span>{account.id === draft.activeGmailAccountId ? "Active" : "Available"}</span>
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
                <div className="setup-warning">
                  <strong>OAuth client ID looks incomplete</strong>
                  <span>It should usually end with .apps.googleusercontent.com. Copy the Client ID from Credentials, not the numeric project ID.</span>
                </div>
              ) : null}
              <Field
                label="OAuth client secret"
                type="password"
                value={activeAccount.clientSecret}
                onChange={(clientSecret) => updateAccount({ ...activeAccount, clientSecret })}
              />
              {clientSecretSuffix ? <p className="secret-suffix">Saved secret ends with {clientSecretSuffix}</p> : null}
              <div className="redirect-uri-box">
                <strong>Authorized redirect URI</strong>
                <code>{googleRedirectUri}</code>
                <span>Add this under Credentials / OAuth client / Authorized redirect URIs. Do not put it in Authorized domains.</span>
              </div>
              <Field
                label="Refresh token"
                type="password"
                value={activeAccount.refreshToken}
                onChange={(refreshToken) => updateAccount({ ...activeAccount, refreshToken })}
              />
              <Button variant="ghost" onClick={() => onConnectGmail(draft)}>
                <KeyRound size={16} />
                Connect Google
              </Button>
              <Button variant="secondary" onClick={() => onSyncGmail(draft)}>
                <MailCheck size={16} />
                Sync Gmail inbox
              </Button>
              <Button variant="danger" onClick={removeActiveAccount}>
                <Trash2 size={16} />
                Remove active account
              </Button>
            </>
          ) : (
            <p>No Google account configured. Add one to enable Gmail cleanup.</p>
          )}
        </div>
        <div className="panel form-panel">
          <div className="panel-heading">
            <strong>OpenAI-compatible model</strong>
          </div>
          <Field label="Base URL" value={draft.openAiBaseUrl} onChange={(openAiBaseUrl) => setDraft({ ...draft, openAiBaseUrl })} />
          <Field label="API key" type="password" value={draft.openAiApiKey} onChange={(openAiApiKey) => setDraft({ ...draft, openAiApiKey })} />
          <Field label="Model" value={draft.openAiModel} onChange={(openAiModel) => setDraft({ ...draft, openAiModel })} />
          <div className="model-probe">
            <div>
              <strong>/v1/models</strong>
              <span>{modelProbe ? (modelProbe.ok ? `${modelProbe.models.length} models found` : modelProbe.error) : "Waiting for URL"}</span>
            </div>
            {modelProbe?.models.slice(0, 5).map((model) => (
              <button
                className="model-option"
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
          <Button variant="ghost" onClick={onProbeTools}>
            <PlugZap size={16} />
            Probe tools
          </Button>
        </div>
        <div className="panel form-panel">
          <div className="panel-heading">
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
        <div className="panel form-panel">
          <div className="panel-heading">
            <strong>Registered tools</strong>
          </div>
          <div className="tool-list">
            {automationTools.length === 0 ? <p>No tools have been probed yet.</p> : null}
            {automationTools.map((tool) => (
              <div className="tool-row" key={tool.id}>
                <div>
                  <strong>{tool.label}</strong>
                  <span>{tool.description}</span>
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
