using System.Text.Json.Serialization;

namespace LocalAIEmailCleaner.Contracts.Emails;

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

public sealed record EmailPage(
    IReadOnlyList<EmailRecord> Emails,
    int Total,
    int Limit,
    int Offset,
    bool HasMore);

public enum EmailRisk
{
    [JsonStringEnumMemberName("low")]
    Low,

    [JsonStringEnumMemberName("medium")]
    Medium,

    [JsonStringEnumMemberName("high")]
    High
}
