import { Suspense } from "react";

const messages: Record<string, string> = {
  "not-on-roster": "Ditt konto finns inte med på någon klasslista i SocratEase.",
  "wrong-domain": "SocratEase kräver att du loggar in med ditt skolkonto (@student.chasacademy.se).",
  "unverified-email": "Google har inte bekräftat din e-postadress.",
  "cohort-ended": "Din klass har avslutats, så SocratEase är inte längre tillgängligt för dig.",
};

async function Reason({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = reason && Object.hasOwn(messages, reason) ? messages[reason] : null;
  return <p>{message ?? "Inloggningen misslyckades."}</p>;
}

export default function NoAccessPage(props: PageProps<"/no-access">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Ingen åtkomst</h1>
      <Suspense fallback={null}>
        <Reason searchParams={props.searchParams as Promise<{ reason?: string }>} />
      </Suspense>
      <p>
        Kontakta din lärare om du tycker att du borde ha åtkomst
        {process.env.TEACHER_EMAIL ? ` (${process.env.TEACHER_EMAIL})` : ""}.
      </p>
      <a href="/login" className="text-sm underline">
        Försök igen med ett annat konto
      </a>
    </main>
  );
}
