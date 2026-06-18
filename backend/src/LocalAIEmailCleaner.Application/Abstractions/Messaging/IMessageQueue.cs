using LocalAIEmailCleaner.Contracts.Messaging;

namespace LocalAIEmailCleaner.Application.Abstractions.Messaging;

public interface IMessageQueue
{
    ValueTask PublishAsync(QueueMessage message, CancellationToken cancellationToken = default);

    IAsyncEnumerable<QueueMessage> ReadAsync(CancellationToken cancellationToken = default);
}
