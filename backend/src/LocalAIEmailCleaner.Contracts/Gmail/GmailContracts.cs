namespace LocalAIEmailCleaner.Contracts.Gmail;

public sealed record GmailAccount(
    string Id,
    string Email,
    string ClientId,
    string ClientSecret,
    string RefreshToken);

public sealed record GmailSyncResponse(
    bool Ok,
    string AccountId,
    int Count);

public sealed record GmailAuthUrlResponse(
    bool Ok,
    string AuthUrl);
