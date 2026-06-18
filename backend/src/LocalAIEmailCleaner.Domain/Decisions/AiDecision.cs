namespace LocalAIEmailCleaner.Domain.Decisions;

public sealed record AiDecision(
    string EmailId,
    EmailAction Action,
    IReadOnlyList<string> Labels,
    double Confidence,
    string Reason,
    DecisionSource Source,
    string? UnsubscribeUrl);
