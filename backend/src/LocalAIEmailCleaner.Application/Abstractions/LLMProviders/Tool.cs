using System.Text.Json.Nodes;

namespace LocalAIEmailCleaner.Application.Abstractions.LLMProviders;

public record Tool(
    string Name,
    string? Description,
    JsonNode? JsonSchema
);
