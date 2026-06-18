namespace LocalAIEmailCleaner.Domain.Cleanup;

public sealed record CleanupRun(
    string Id,
    DateTimeOffset StartedAt,
    DateTimeOffset? FinishedAt,
    CleanupStatus Status,
    CleanupMode Mode,
    int Scanned,
    int Deleted,
    int Archived,
    int Labeled,
    int Unsubscribed,
    IReadOnlyList<string> Backups,
    IReadOnlyList<string> Notes);
