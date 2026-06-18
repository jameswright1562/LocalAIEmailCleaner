using LocalAIEmailCleaner.Domain.GmailAccounts;

namespace LocalAIEmailCleaner.Domain.Settings;

public sealed record Settings(
    string ActiveGmailAccountId,
    IReadOnlyList<GmailAccount> GmailAccounts,
    string OpenAiBaseUrl,
    string OpenAiApiKey,
    string OpenAiModel,
    string WebclawMcpEndpoint,
    string McpStdioCommand,
    string McpStdioArgs,
    string McpStdioCwd,
    bool WebclawEnabled,
    bool PlaywrightEnabled,
    bool AutoRegisterAutomationTools,
    bool BackupDeletedEmails,
    bool AutoLabelEnabled,
    IReadOnlyList<string> AvailableLabels,
    bool DryRun);
