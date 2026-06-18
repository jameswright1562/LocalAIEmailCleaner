namespace LocalAIEmailCleaner.Domain.Settings;

public static class DefaultSettings
{
    public static IReadOnlyList<string> AvailableLabels { get; } =
    [
        "Job",
        "Holiday",
        "Finance",
        "Newsletter",
        "Personal",
        "Receipt"
    ];
}
