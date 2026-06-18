using System.Text.Json.Serialization;

namespace LocalAIEmailCleaner.Contracts.Cleanup;

public sealed record CleanupRun(
    string Id,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    CleanupRunStatus Status,
    CleanupMode Mode,
    int Scanned,
    int Deleted,
    int Archived,
    int Labeled,
    int Unsubscribed,
    IReadOnlyList<string> Backups,
    IReadOnlyList<string> Notes);

public sealed record CleanupStreamEvent(
    CleanupStreamEventType Type,
    DateTimeOffset At,
    string Message,
    object? Data = null);

public sealed record ReasoningTraceItem(
    string Id,
    DateTimeOffset At,
    string Title,
    string? From,
    string? Subject,
    string Content);

public enum CleanupRunStatus
{
    [JsonStringEnumMemberName("running")]
    Running,

    [JsonStringEnumMemberName("completed")]
    Completed,

    [JsonStringEnumMemberName("failed")]
    Failed
}

public enum CleanupMode
{
    [JsonStringEnumMemberName("manual")]
    Manual,

    [JsonStringEnumMemberName("scheduled")]
    Scheduled,

    [JsonStringEnumMemberName("unsubscribe-all")]
    UnsubscribeAll
}

public enum CleanupStreamEventType
{
    [JsonStringEnumMemberName("log")]
    Log,

    [JsonStringEnumMemberName("model_delta")]
    ModelDelta,

    [JsonStringEnumMemberName("model_result")]
    ModelResult,

    [JsonStringEnumMemberName("reasoning")]
    Reasoning,

    [JsonStringEnumMemberName("run")]
    Run,

    [JsonStringEnumMemberName("error")]
    Error
}
