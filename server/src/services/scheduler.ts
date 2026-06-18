import { runCleanup } from "./cleanup.js";
import { createLogger } from "./logger.js";
import { readState, updateConfig } from "./store.js";
import { Schedule } from "../types.js";

const tickIntervalMs = Math.max(15_000, Number(process.env.LOCALAI_SCHEDULER_INTERVAL_MS ?? 60_000));
const log = createLogger("scheduler");

export function addCadence(date: Date, cadence: Schedule["cadence"]): Date {
  const next = new Date(date.getTime());
  if (cadence === "daily") next.setDate(next.getDate() + 1);
  else if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function anchorFromTime(time: string, reference: Date): Date {
  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const anchor = new Date(reference.getTime());
  anchor.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return anchor;
}

// Returns the next future run time, advancing by cadence past `now` so a downed server only runs once on restart.
export function computeNextRunAt(schedule: Schedule, now: Date = new Date()): string {
  const parsed = schedule.nextRunAt ? new Date(schedule.nextRunAt) : undefined;
  let anchor =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed : anchorFromTime(schedule.time, now);
  let guard = 0;
  while (anchor.getTime() <= now.getTime() && guard < 1000) {
    anchor = addCadence(anchor, schedule.cadence);
    guard += 1;
  }
  return anchor.toISOString();
}

export function isDue(schedule: Schedule, now: Date = new Date()): boolean {
  if (!schedule.enabled || !schedule.nextRunAt) return false;
  const next = new Date(schedule.nextRunAt);
  return !Number.isNaN(next.getTime()) && next.getTime() <= now.getTime();
}

let ticking = false;

export async function runDueSchedules(now: Date = new Date()): Promise<string[]> {
  const state = await readState();
  const due = state.schedules.filter((schedule) => isDue(schedule, now));
  const ran: string[] = [];
  for (const schedule of due) {
    log.info(`Running scheduled cleanup for "${schedule.name}" (${schedule.id}).`);
    try {
      await runCleanup("scheduled");
      ran.push(schedule.id);
    } catch (error) {
      log.error(`Scheduled run for ${schedule.id} failed: ${(error as Error).message}`);
    } finally {
      const nextRunAt = computeNextRunAt({ ...schedule, nextRunAt: schedule.nextRunAt }, now);
      await updateConfig((nextState) => {
        const target = nextState.schedules.find((item) => item.id === schedule.id);
        if (target) target.nextRunAt = nextRunAt;
      });
    }
  }
  return ran;
}

export function startScheduler(): () => void {
  const tick = () => {
    if (ticking) return;
    ticking = true;
    void runDueSchedules()
      .catch((error: unknown) => log.error(`tick failed: ${(error as Error).message}`))
      .finally(() => {
        ticking = false;
      });
  };

  const timer = setInterval(tick, tickIntervalMs);
  if (typeof timer.unref === "function") timer.unref();
  log.info(`Scheduler started; checking schedules every ${Math.round(tickIntervalMs / 1000)}s.`);
  void Promise.resolve().then(tick);
  return () => clearInterval(timer);
}
