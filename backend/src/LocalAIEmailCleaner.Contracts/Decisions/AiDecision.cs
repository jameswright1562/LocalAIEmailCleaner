using System.Text.Json.Serialization;

namespace LocalAIEmailCleaner.Contracts.Decisions;

public sealed record AiDecision(
    string EmailId,
    EmailAction Action,
    IReadOnlyList<string> Labels,
    double Confidence,
    string Reason,
    DecisionSource Source,
    string? UnsubscribeUrl);

public sealed record EmailActionRequest(
    EmailAction Action,
    IReadOnlyList<string>? Labels);

public sealed record EmailActionResponse(
    bool Ok,
    EmailAction Action,
    string Note);

public sealed record DecisionHistoryRow(
    string? RunId,
    string EmailId,
    string AccountId,
    string Sender,
    string Subject,
    EmailAction Action,
    IReadOnlyList<string> Labels,
    double Confidence,
    string Reason,
    DecisionSource Source,
    string? UnsubscribeUrl,
    DateTimeOffset CreatedAt);

public enum EmailAction
{
    [JsonStringEnumMemberName("keep")]
    Keep,

    [JsonStringEnumMemberName("archive")]
    Archive,

    [JsonStringEnumMemberName("delete")]
    Delete,

    [JsonStringEnumMemberName("label")]
    Label,

    [JsonStringEnumMemberName("unsubscribe")]
    Unsubscribe
}

public enum DecisionSource
{
    [JsonStringEnumMemberName("model")]
    Model,

    [JsonStringEnumMemberName("heuristic")]
    Heuristic,

    [JsonStringEnumMemberName("model-fallback")]
    ModelFallback
}
