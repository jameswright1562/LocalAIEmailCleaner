namespace LocalAIEmailCleaner.Application.Abstractions.LLMProviders;

public record ClientOptions
{
    public required string BaseUrl { get; init; }
    public required bool IncludeUsage { get; init; }
}
