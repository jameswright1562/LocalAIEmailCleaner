using System.Text.Json;
using System.Text.Json.Nodes;
using LocalAIEmailCleaner.Application.Abstractions.Automation;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using LocalAIEmailCleaner.Application.Settings;

namespace LocalAIEmailCleaner.Infrastructure.Automation;

public sealed class AutomationClient : IAutomationClient
{
    private McpClient? _mcpClient;

    public bool IsInitialised => _mcpClient != null;

    public async Task Initialise(McpOptions mcpOptions)
    {
        _mcpClient = await McpClient.CreateAsync(new StdioClientTransport(new StdioClientTransportOptions
        {
            Command = mcpOptions.Command,
            Arguments = mcpOptions.Args?.Split(" ").ToList(),
            StandardErrorLines = mcpOptions.OnError
        }));
    }

    public async Task<IReadOnlyList<AutomationToolDescriptor>> GetTools(CancellationToken ct)
    {
        if (_mcpClient is null)
        {
            return [];
        }

        var tools = await _mcpClient.ListToolsAsync(cancellationToken: ct);
        return tools
            .Select(tool => new AutomationToolDescriptor(
                tool.Name,
                tool.Description,
                ToJsonNode(tool.JsonSchema)))
            .ToList();
    }

    private static JsonNode? ToJsonNode(JsonElement jsonElement)
    {
        return jsonElement.ValueKind == JsonValueKind.Undefined
            ? null
            : JsonNode.Parse(jsonElement.GetRawText());
    }
}
