import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireViewer } from "@/access/viewer";
import { signOut } from "@/auth";
import { pool } from "@/db/client";
import { cohorts } from "@/db/schema";
import { Chat } from "./chat/chat";

async function ChatForViewer() {
  await connection();
  const viewer = await requireViewer();
  if (viewer.role === "student") {
    return (
      <>
        <p className="text-sm text-zinc-500">{viewer.cohortName}</p>
        <Chat />
      </>
    );
  }
  // The Teacher has no Cohort of their own; until #20 they pick one to try the chat in.
  const allCohorts = await drizzle(pool)
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(asc(cohorts.name));
  return <Chat cohorts={allCohorts} />;
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">SocratEase</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-sm text-zinc-500 underline">Logga ut</button>
        </form>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Laddar…</p>}>
        <ChatForViewer />
      </Suspense>
    </main>
  );
}
