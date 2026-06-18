namespace LocalAIEmailCleaner.Domain.Schedules;

public sealed record ScheduleActions(
    bool DeleteLowConfidence,
    bool AutoLabel,
    bool UnsubscribeNewsletters);
