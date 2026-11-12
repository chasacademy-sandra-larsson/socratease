import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { listCohorts } from "@/access";
import { startViewingAs } from "@/access/view-as-actions";
import { requireViewer } from "@/access/viewer";
import { db } from "@/db/client";
import { questionInsights } from "@/teacher-view";

export const metadata: Metadata = { title: "Lärarvy – SocratEase" };

// Built only from the anonymous Question Log: nothing here can show who asked (ADR 0003).
async function Insights({ searchParams }: { searchParams: PageProps<"/larare">["searchParams"] }) {
  await connection();
  const viewer = await requireViewer();
  if (viewer.role !== "teacher") redirect("/");

  const all = await listCohorts(db);
  if (all.length === 0) return <p className="text-zinc-500">Det finns ingen klass än.</p>;
  const { klass } = await searchParams;
  const cohort = all.find((c) => c.id === klass) ?? all[0];
  const { unanswered, topics, sources } = await questionInsights(db, cohort.id);

  return (
    <>
      <nav className="flex flex-wrap gap-3 text-sm">
        {all.map((c) => (
          <Link
            key={c.id}
            href={`/larare?klass=${c.id}`}
            className={c.id === cohort.id ? "font-semibold" : "text-zinc-500 underline"}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <form action={startViewingAs}>
        <input type="hidden" name="cohortId" value={cohort.id} />
        <button className="text-sm underline">Visa som student i {cohort.name}</button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Obesvarade frågor</h2>
        <p className="text-sm text-zinc-500">
          Det som kursmaterialet inte täcker, ordagrant men utan kod. Grupperat per vecka och den kurs som pågick då.
        </p>
        {unanswered.length === 0 && <p className="text-zinc-500">Inga obesvarade frågor än.</p>}
        {unanswered.map((group) => (
          <div key={`${group.week}|${group.course}`}>
            <h3 className="font-medium">
              {group.week} · {group.course ?? "Ingen kurs pågick"}
            </h3>
            <ul className="list-disc pl-5">
              {group.questions.map((question, i) => (
                <li key={i}>{question}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Frågor per ämne och vecka</h2>
        {topics.length === 0 ? (
          <p className="text-zinc-500">Inga frågor än.</p>
        ) : (
          <table className="text-sm">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="py-1 pr-4 font-normal">Vecka</th>
                <th className="py-1 pr-4 font-normal">Ämne</th>
                <th className="py-1 text-right font-normal">Frågor</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={`${t.week}|${t.topic}`} className="border-t">
                  <td className="py-1 pr-4 whitespace-nowrap">{t.week}</td>
                  <td className="py-1 pr-4">{t.topic}</td>
                  <td className="py-1 text-right">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Mest använda källor</h2>
        {sources.length === 0 && <p className="text-zinc-500">Inga källor använda än.</p>}
        <ol className="list-decimal pl-5">
          {sources.map((s) => (
            <li key={s.title}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
              ) : (
                s.title
              )}{" "}
              <span className="text-zinc-500">({s.count})</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default function TeacherPage(props: PageProps<"/larare">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Lärarvy</h1>
        <Link href="/" className="text-sm text-zinc-500 underline">
          Till chatten
        </Link>
      </header>
      <Suspense fallback={<p className="text-zinc-500">Laddar…</p>}>
        <Insights searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
