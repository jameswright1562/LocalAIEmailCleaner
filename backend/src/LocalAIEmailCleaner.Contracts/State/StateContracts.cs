using LocalAIEmailCleaner.Contracts.Cleanup;
using LocalAIEmailCleaner.Contracts.Decisions;
using LocalAIEmailCleaner.Contracts.Emails;
using LocalAIEmailCleaner.Contracts.Tools;
using AppSchedule = LocalAIEmailCleaner.Contracts.Schedules.Schedule;
using AppSettings = LocalAIEmailCleaner.Contracts.Settings.Settings;

namespace LocalAIEmailCleaner.Contracts.State;

public sealed record AppState(
    AppSettings Settings,
    IReadOnlyList<AutomationTool> AutomationTools,
    IReadOnlyList<EmailRecord> Emails,
    IReadOnlyList<AiDecision> Decisions,
    IReadOnlyList<CleanupRun> Runs,
    IReadOnlyList<AppSchedule> Schedules);
