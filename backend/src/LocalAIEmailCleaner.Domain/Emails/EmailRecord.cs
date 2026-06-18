namespace LocalAIEmailCleaner.Domain.Emails;

public sealed record EmailRecord(
    string Id,
    string AccountId,
    string ThreadId,
    string From,
    string Subject,
    string Snippet,
    DateTimeOffset ReceivedAt,
    IReadOnlyList<string> Labels,
    string? UnsubscribeUrl,
    EmailRisk Risk,
    DateTimeOffset? ProcessedAt);
