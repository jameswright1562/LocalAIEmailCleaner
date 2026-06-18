import { describe, expect, it } from "vitest";
import { addCadence, computeNextRunAt, isDue } from "./scheduler.js";
import type { Schedule } from "../types.js";

function schedule(overrides: Partial<Schedule>): Schedule {
  return {
    id: "s1",
    name: "Test",
    cadence: "daily",
    time: "09:00",
    enabled: true,
    actions: { deleteLowConfidence: false, autoLabel: true, unsubscribeNewsletters: false },
    nextRunAt: "2026-06-18T09:00:00.000Z",
    ...overrides
  };
}

describe("scheduler helpers", () => {
  it("advances dates by cadence", () => {
    const base = new Date("2026-06-18T09:00:00.000Z");
    expect(addCadence(base, "daily").toISOString()).toBe("2026-06-19T09:00:00.000Z");
    expect(addCadence(base, "weekly").toISOString()).toBe("2026-06-25T09:00:00.000Z");
    expect(addCadence(base, "monthly").toISOString()).toBe("2026-07-18T09:00:00.000Z");
  });

  it("treats a schedule as due only when enabled and the time has passed", () => {
    const now = new Date("2026-06-18T10:00:00.000Z");
    expect(isDue(schedule({ nextRunAt: "2026-06-18T09:00:00.000Z" }), now)).toBe(true);
    expect(isDue(schedule({ nextRunAt: "2026-06-18T11:00:00.000Z" }), now)).toBe(false);
    expect(isDue(schedule({ enabled: false, nextRunAt: "2026-06-18T09:00:00.000Z" }), now)).toBe(false);
  });

  it("computes the next future run time once past the current slot", () => {
    const now = new Date("2026-06-20T10:00:00.000Z");
    const next = computeNextRunAt(schedule({ cadence: "daily", nextRunAt: "2026-06-18T09:00:00.000Z" }), now);
    expect(new Date(next).getTime()).toBeGreaterThan(now.getTime());
    expect(next).toBe("2026-06-21T09:00:00.000Z");
  });
});
