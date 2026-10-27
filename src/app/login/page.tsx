import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">SocratEase</h1>
      <p>Logga in med ditt skolkonto (@student.chasacademy.se).</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="rounded-full bg-black px-5 py-3 text-white dark:bg-white dark:text-black">
          Logga in med Google
        </button>
      </form>
    </main>
  );
}
