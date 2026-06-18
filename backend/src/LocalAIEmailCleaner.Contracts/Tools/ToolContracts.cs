using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace LocalAIEmailCleaner.Contracts.Tools;

public sealed record AutomationTool(
    string Id,
    string Label,
    AutomationToolProvider Provider,
    bool Enabled,
    bool Connected,
    string Description,
    string? McpName,
    JsonNode? JsonSchema);

public sealed record ToolsProbeResponse(
    bool Ok,
    IReadOnlyList<AutomationTool> AutomationTools);

public enum AutomationToolProvider
{
    [JsonStringEnumMemberName("mcp-stdio")]
    McpStdio,

    [JsonStringEnumMemberName("playwright")]
    Playwright
}
