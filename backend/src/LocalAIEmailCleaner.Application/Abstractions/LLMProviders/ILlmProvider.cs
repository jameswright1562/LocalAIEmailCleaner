namespace LocalAIEmailCleaner.Application.Abstractions.LLMProviders;

public interface ILlmProvider
{
    
    public IAsyncEnumerable<string> RequestCompletion(string completionId, string model, Tool[] tools, Message[] messages, CancellationToken ct);
}
