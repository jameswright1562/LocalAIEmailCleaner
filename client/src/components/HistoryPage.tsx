import { CleanupRun } from "../types";
import { StatusChip } from "./Chips";

export function HistoryPage({ runs }: { runs: CleanupRun[] }) {
  return (
    <section className="page-grid">
      <header className="page-header">
        <div>
          <h1>Cleanup history</h1>
          <p>Every run records outcomes and local deleted-email backup paths.</p>
        </div>
      </header>
      <div className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Scanned</th>
              <th>Deleted</th>
              <th>Labeled</th>
              <th>Unsubscribed</th>
              <th>Backups</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{new Date(run.startedAt).toLocaleString()}</td>
                <td>{run.mode}</td>
                <td>
                  <StatusChip tone={run.status === "completed" ? "good" : "warn"}>{run.status}</StatusChip>
                </td>
                <td>{run.scanned}</td>
                <td>{run.deleted}</td>
                <td>{run.labeled}</td>
                <td>{run.unsubscribed}</td>
                <td>{run.backups.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 ? <p className="empty-state">No cleanup runs yet.</p> : null}
      </div>
    </section>
  );
}
