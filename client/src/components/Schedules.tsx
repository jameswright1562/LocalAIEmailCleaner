import { CalendarPlus, Save, Trash2 } from "lucide-react";
import { Button, Field, Toggle } from "./Controls";
import { Schedule } from "../types";
import { useMemo, useState } from "react";

type Props = {
  schedules: Schedule[];
  onSave: (schedule: Schedule) => void;
  onDelete: (id: string) => void;
};

export function Schedules({ schedules, onSave, onDelete }: Props) {
  const initial = useMemo(() => schedules[0] ?? createSchedule(), [schedules]);
  const [draft, setDraft] = useState<Schedule>(initial);

  return (
    <section className="mx-auto grid max-w-7xl gap-5">
      <header className="flex items-center justify-between gap-4 max-[620px]:flex-col max-[620px]:items-stretch">
        <div>
          <h1 className="text-3xl font-bold leading-10 tracking-normal text-slate-950 max-[620px]:text-2xl">
            Scheduled cleanup runs
          </h1>
          <p className="text-slate-500">Automate inbox reviews without deleting mail before backup.</p>
        </div>
        <Button onClick={() => setDraft(createSchedule())}>
          <CalendarPlus size={16} />
          New schedule
        </Button>
      </header>
      <div className="grid grid-cols-[minmax(320px,0.8fr)_minmax(480px,1.2fr)] items-start gap-4 max-[980px]:grid-cols-1">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white px-4 pb-4">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200">
            <strong>Schedule editor</strong>
          </div>
          <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <label className="grid gap-1.5">
            <span className="text-sm font-extrabold text-slate-700">Cadence</span>
            <select
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-indigo-700 focus:ring-4 focus:ring-indigo-700/10"
              value={draft.cadence}
              onChange={(event) => setDraft({ ...draft, cadence: event.target.value as Schedule["cadence"] })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <Field label="Time" type="time" value={draft.time} onChange={(time) => setDraft({ ...draft, time })} />
          <Toggle label="Enabled" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
          <Toggle
            label="Auto label"
            description="Apply model labels such as Job, Holiday, Finance, and Newsletter."
            checked={draft.actions.autoLabel}
            onChange={(autoLabel) => setDraft({ ...draft, actions: { ...draft.actions, autoLabel } })}
          />
          <Toggle
            label="Unsubscribe newsletters"
            checked={draft.actions.unsubscribeNewsletters}
            onChange={(unsubscribeNewsletters) =>
              setDraft({ ...draft, actions: { ...draft.actions, unsubscribeNewsletters } })
            }
          />
          <Toggle
            label="Allow low-confidence deletes"
            checked={draft.actions.deleteLowConfidence}
            onChange={(deleteLowConfidence) =>
              setDraft({ ...draft, actions: { ...draft.actions, deleteLowConfidence } })
            }
          />
          <Button onClick={() => onSave({ ...draft, nextRunAt: nextRunIso(draft) })}>
            <Save size={16} />
            Save schedule
          </Button>
        </div>
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4">
            <strong>Configured runs</strong>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Name", "Cadence", "Next run", "Status", ""].map((heading) => (
                  <th className="border-b border-slate-100 px-4 py-3 text-left align-top text-xs font-extrabold uppercase tracking-normal text-slate-500" key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">{schedule.name}</td>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">{schedule.cadence}</td>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">{new Date(schedule.nextRunAt).toLocaleString()}</td>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">{schedule.enabled ? "Enabled" : "Paused"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 align-top">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-rose-600"
                      onClick={() => onDelete(schedule.id)}
                      type="button"
                      aria-label="Delete schedule"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function createSchedule(): Schedule {
  return {
    id: crypto.randomUUID(),
    name: "Daily inbox reset",
    cadence: "daily",
    time: "17:00",
    enabled: true,
    actions: { autoLabel: true, unsubscribeNewsletters: true, deleteLowConfidence: false },
    nextRunAt: nextRunIso({ cadence: "daily", time: "17:00" } as Schedule)
  };
}

function nextRunIso(schedule: Schedule) {
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  if (schedule.cadence === "weekly") date.setDate(date.getDate() + 7);
  if (schedule.cadence === "monthly") date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}
