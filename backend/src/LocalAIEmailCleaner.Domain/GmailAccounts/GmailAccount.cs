namespace LocalAIEmailCleaner.Domain.GmailAccounts;

public sealed record GmailAccount(
    string Id,
    string Email,
    string ClientId,
    string ClientSecret,
    string RefreshToken);
