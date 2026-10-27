import { Suspense } from "react";
import { requireViewer } from "@/access/viewer";
import { signOut } from "@/auth";

async function Welcome() {
  const viewer = await requireViewer();
  return (
    <p>
      {viewer.role === "teacher"
        ? "Du är inloggad som lärare."
        : `Du är inloggad som student i ${viewer.cohortName}.`}
    </p>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">SocratEase</h1>
      <Suspense fallback={<p className="text-zinc-500">Laddar…</p>}>
        <Welcome />
      </Suspense>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button className="text-sm text-zinc-500 underline">Logga ut</button>
      </form>
    </main>
  );
}
