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
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h1>Scheduled cleanup runs</h1>
          <p>Automate inbox reviews without deleting mail before backup.</p>
        </div>
        <Button onClick={() => setDraft(createSchedule())}>
          <CalendarPlus size={16} />
          New schedule
        </Button>
      </header>
      <div className="two-column">
        <div className="panel form-panel">
          <div className="panel-heading">
            <strong>Schedule editor</strong>
          </div>
          <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <label className="field">
            <span>Cadence</span>
            <select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as Schedule["cadence"] })}>
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
        <div className="panel table-panel">
          <div className="panel-heading">
            <strong>Configured runs</strong>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Cadence</th>
                <th>Next run</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{schedule.name}</td>
                  <td>{schedule.cadence}</td>
                  <td>{new Date(schedule.nextRunAt).toLocaleString()}</td>
                  <td>{schedule.enabled ? "Enabled" : "Paused"}</td>
                  <td>
                    <button className="icon-button" onClick={() => onDelete(schedule.id)} type="button" aria-label="Delete schedule">
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
