namespace LocalAIEmailCleaner.Contracts.Messaging;

public sealed record QueueMessage(
    string Id,
    string Type,
    string Payload);
