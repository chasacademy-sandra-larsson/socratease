"use client";

import { useActionState } from "react";
import { syncNow } from "./actions";

/** "Synka nu", with the outcome of the click right below it. */
export function SyncNowForm({ cohortId }: { cohortId: string }) {
  const [result, action, pending] = useActionState(syncNow, null);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="cohortId" value={cohortId} />
      <button
        disabled={pending}
        className="self-start rounded-full bg-black px-4 py-1 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {pending ? "Synkar…" : "Synka nu"}
      </button>
      {result && !pending && (
        <p className={result.ok ? "text-sm" : "text-sm text-red-700 dark:text-red-400"}>{result.message}</p>
      )}
    </form>
  );
}
