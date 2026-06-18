namespace LocalAIEmailCleaner.Application.Abstractions.LLMProviders;

public class Message
{
    public required string Content { get; set; }
    public required string Role { get; set; }
}
