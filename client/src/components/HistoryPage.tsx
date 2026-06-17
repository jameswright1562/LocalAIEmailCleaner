import { CleanupRun } from "../types";
import { StatusChip } from "./Chips";

export function HistoryPage({ runs }: { runs: CleanupRun[] }) {
  return (
    <section className="mx-auto grid max-w-7xl gap-5">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold leading-10 tracking-normal text-slate-950 max-[620px]:text-2xl">Cleanup history</h1>
          <p className="text-slate-500">Every run records outcomes and local deleted-email backup paths.</p>
        </div>
      </header>
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Run", "Mode", "Status", "Scanned", "Deleted", "Labeled", "Unsubscribed", "Backups"].map((heading) => (
                <th className="border-b border-slate-100 px-4 py-3 text-left align-top text-xs font-extrabold uppercase tracking-normal text-slate-500" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{new Date(run.startedAt).toLocaleString()}</td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{run.mode}</td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">
                  <StatusChip tone={run.status === "completed" ? "good" : run.status === "failed" ? "danger" : "warn"}>{run.status}</StatusChip>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{run.scanned}</td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{run.deleted}</td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{run.labeled}</td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{run.unsubscribed}</td>
                <td className="border-b border-slate-100 px-4 py-3 align-top">{run.backups.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 ? <p className="p-4 text-slate-500">No cleanup runs yet.</p> : null}
      </div>
    </section>
  );
}
