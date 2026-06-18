namespace LocalAIEmailCleaner.Application.Settings;

public class McpOptions
{
    public required string Command { get; init; }
    public string? Args { get; init; }
    public IDictionary<string, string>? EnvironmentVariables { get; init; } 
    public Action<string>?  OnError { get; init; }
}
