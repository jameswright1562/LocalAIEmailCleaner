using System.Text.Json.Serialization;

namespace LocalAIEmailCleaner.Contracts.Schedules;

public sealed record Schedule(
    string Id,
    string Name,
    ScheduleCadence Cadence,
    string Time,
    bool Enabled,
    ScheduleActions Actions,
    DateTimeOffset NextRunAt);

public sealed record ScheduleActions(
    bool DeleteLowConfidence,
    bool AutoLabel,
    bool UnsubscribeNewsletters);

public enum ScheduleCadence
{
    [JsonStringEnumMemberName("daily")]
    Daily,

    [JsonStringEnumMemberName("weekly")]
    Weekly,

    [JsonStringEnumMemberName("monthly")]
    Monthly
}
