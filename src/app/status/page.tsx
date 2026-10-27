import { connection } from "next/server";
import { Suspense } from "react";
import { pool } from "@/db/client";
import { getDatabaseStatus } from "@/db/status";

async function DatabaseStatus() {
  await connection();
  const status = await getDatabaseStatus(pool);

  if (!status.reachable) {
    // Details stay in the server log; they can reveal host names and users.
    console.error("Database status check failed:", status.error);
    return (
      <p className="text-red-700 dark:text-red-400">Databasen går inte att nå.</p>
    );
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
      <dt className="text-zinc-500">Databas</dt>
      <dd>Ansluten</dd>
      <dt className="text-zinc-500">Migreringar</dt>
      <dd>{status.migrationsApplied}</dd>
      <dt className="text-zinc-500">pgvector</dt>
      <dd>{status.pgvectorVersion ?? "saknas"}</dd>
    </dl>
  );
}

export default function StatusPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">SocratEase</h1>
      <Suspense fallback={<p className="text-zinc-500">Kontrollerar databasen…</p>}>
        <DatabaseStatus />
      </Suspense>
    </main>
  );
}
