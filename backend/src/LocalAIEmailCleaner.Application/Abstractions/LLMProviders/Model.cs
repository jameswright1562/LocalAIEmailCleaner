namespace LocalAIEmailCleaner.Application.Abstractions.LLMProviders;

public record ModelInfo
{
    public required string Id { get; init; }
    public DateTime? Created { get; init; }
    public string? OwnedBy { get; init; }
}
