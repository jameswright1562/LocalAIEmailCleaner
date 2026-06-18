using LocalAIEmailCleaner.Application.Settings;

namespace LocalAIEmailCleaner.Application.Abstractions.Automation;

public interface IAutomationClient
{
    Task Initialise(McpOptions mcpOptions);

    Task<IReadOnlyList<AutomationToolDescriptor>> GetTools(CancellationToken ct);
}
