using System.Text.Json.Nodes;

namespace LocalAIEmailCleaner.Application.Abstractions.Automation;

public sealed record AutomationToolDescriptor(
    string Name,
    string? Description,
    JsonNode? JsonSchema);
