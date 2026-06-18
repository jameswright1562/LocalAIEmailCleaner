namespace LocalAIEmailCleaner.Application.Abstractions.LLMProviders;

public record OpenAiClientOptions : ClientOptions
{
    public required string? ApiKey { get; init; }
}
