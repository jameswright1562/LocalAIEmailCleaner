using System.ClientModel;
using LocalAIEmailCleaner.Application.Abstractions.LLMProviders;
using OpenAI;
using OpenAI.Chat;

namespace LocalAIEmailCleaner.Infrastructure.Models;

public class OpenAIClient : ILlmProvider
{
    private OpenAI.OpenAIClient _client;

    public void Initialise(OpenAiClientOptions clientOptions)
    {
        _client = new OpenAI.OpenAIClient(new ApiKeyCredential(clientOptions.ApiKey),
            new OpenAIClientOptions()
            {
                Endpoint = new Uri(clientOptions.BaseUrl),
            });
    }
    
    public async IAsyncEnumerable<string> RequestCompletion(string completionId, string model, Tool[] tools, Message[] messages, CancellationToken ct)
    {
        var chatTools = tools.Select(x => ChatTool.CreateFunctionTool(x.Name, x.Description, new BinaryData(x.JsonSchema))).ToList();
        return await _client.GetChatClient(model).CompleteChatStreamingAsync(messages.Select(x =>
        {
            if (x.Role == "assistant")
                return new AssistantChatMessage(x.Content);
            return new SystemChatMessage(x.Content);
        }),
            new ChatCompletionOptions(tools:);
    }
}
