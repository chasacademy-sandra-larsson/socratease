import type { SyncRun, SyncStatus } from "@/teacher-view";
import { SyncNowForm } from "./sync-button";

const STATUS: Record<SyncRun["status"], string> = {
  completed: "Klar",
  continues: "Fortsätter i nästa körning",
  failed: "Misslyckades",
  locked: "Hoppades över: en annan synk pågick",
};

function when(date: Date): string {
  return date.toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" });
}

/** The sync status, its log and the "sync now" button for one Cohort (#15). */
export function SyncSection({ cohortId, status }: { cohortId: string; status: SyncStatus }) {
  const { fromNotion, syncing, latest, runs } = status;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Synk från Notion</h2>
      {!fromNotion ? (
        <p className="text-zinc-500">Klassen synkas inte från Notion.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {latest
              ? `Senast: ${STATUS[latest.status].toLowerCase()} · ${when(latest.finishedAt)} · ${latest.pagesSynced} sidor uppdaterade, ${latest.sourcesRemoved} källor borttagna`
              : "Klassen har inte synkats än."}
            {syncing && " · En synk pågick när sidan laddades."}
          </p>
          <SyncNowForm cohortId={cohortId} />
          {latest && latest.failures.length > 0 && (
            <div>
              <h3 className="font-medium">Fel</h3>
              <ul className="list-disc pl-5 text-red-700 dark:text-red-400">
                {latest.failures.map((failure, i) => (
                  <li key={i}>{failure}</li>
                ))}
              </ul>
            </div>
          )}
          {latest && latest.skipped.length > 0 && (
            <div>
              <h3 className="font-medium">Hoppades över</h3>
              <ul className="list-disc pl-5">
                {latest.skipped.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {latest && latest.notFilledIn.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Pass som inte är ifyllda ({latest.notFilledIn.length})</summary>
              <ul className="list-disc pl-5 text-sm">
                {latest.notFilledIn.map((session) => (
                  <li key={session}>{session}</li>
                ))}
              </ul>
            </details>
          )}
          {runs.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Senaste körningar</summary>
              <table className="text-sm">
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t">
                      <td className="py-1 pr-4 whitespace-nowrap">{when(run.startedAt)}</td>
                      <td className="py-1 pr-4">{STATUS[run.status]}</td>
                      <td className="py-1 pr-4 text-right">{run.pagesSynced} sidor</td>
                      <td className="py-1 text-right">{run.failures.length} fel</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </section>
  );
}
