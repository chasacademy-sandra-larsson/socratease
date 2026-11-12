import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listCohorts } from "@/access";
import { logOut, startViewingAs } from "@/access/view-as-actions";
import { requireViewer } from "@/access/viewer";
import { db } from "@/db/client";
import { Chat } from "./chat/chat";

async function ChatForViewer() {
  await connection();
  const viewer = await requireViewer();
  if (viewer.role === "student") {
    return (
      <>
        <p className="text-sm text-zinc-500">{viewer.cohortName}</p>
        <Chat cohortId={viewer.cohortId} />
      </>
    );
  }
  // The Teacher has no Cohort of their own: they try the chat by viewing as a Student of one.
  const allCohorts = await listCohorts(db);
  if (allCohorts.length === 0) {
    return <p className="text-zinc-500">Det finns ingen klass med kursmaterial än.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Link href="/larare" className="underline">
        Lärarvy: frågor och källor
      </Link>
      <form action={startViewingAs} className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          Prova chatten som student i
          <select name="cohortId" className="rounded border px-2 py-1 dark:bg-zinc-900">
            {allCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-full bg-black px-4 py-1 text-white dark:bg-white dark:text-black">
          Visa som student
        </button>
      </form>
      <p className="text-sm text-zinc-500">
        Du ser då exakt det en student i klassen ser. Dina frågor sparas inte i frågeloggen.
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">SocratEase</h1>
        <form action={logOut}>
          <button className="text-sm text-zinc-500 underline">Logga ut</button>
        </form>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Laddar…</p>}>
        <ChatForViewer />
      </Suspense>
    </main>
  );
}
