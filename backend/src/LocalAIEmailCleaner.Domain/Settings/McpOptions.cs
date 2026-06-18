namespace LocalAIEmailCleaner.Domain.Settings;

public sealed class McpOptions
{ 
        public required string Command { get; init; }
        public string? Args { get; init; }
        public IDictionary<string, string>? EnvironmentVariables { get; init; } 
}
