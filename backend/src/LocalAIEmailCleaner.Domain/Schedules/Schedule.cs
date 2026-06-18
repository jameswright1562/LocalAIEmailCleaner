namespace LocalAIEmailCleaner.Domain.Schedules;

public sealed record Schedule(
    string Id,
    string Name,
    ScheduleCadence Cadence,
    string Time,
    bool Enabled,
    ScheduleActions Actions,
    DateTimeOffset NextRunAt);
