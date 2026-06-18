namespace LocalAIEmailCleaner.Contracts.Models;

public sealed record ModelInfo(
    string Id,
    long? Created,
    string? OwnedBy);

public sealed record ModelProbe(
    bool Ok,
    string BaseUrl,
    IReadOnlyList<ModelInfo> Models,
    string? Error);
