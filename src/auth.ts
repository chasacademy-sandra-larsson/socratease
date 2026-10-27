import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { resolveAccess, type GoogleIdentity, type Viewer } from "@/access";
import { db } from "@/db/client";

declare module "next-auth" {
  interface Session {
    viewer?: Viewer;
  }
}

/** How often a logged-in Viewer is checked against the Roster again. */
const RECHECK_MS = 5 * 60 * 1000;

function teacherEmail() {
  const email = process.env.TEACHER_EMAIL?.trim();
  if (!email || !email.toLowerCase().endsWith("@chasacademy.se")) {
    throw new Error("TEACHER_EMAIL must be set to a @chasacademy.se address");
  }
  return email;
}

function identityFrom(profile: Record<string, unknown> | undefined): GoogleIdentity {
  return {
    email: String(profile?.email ?? ""),
    emailVerified: profile?.email_verified === true,
    hostedDomain: typeof profile?.hd === "string" ? profile.hd : undefined,
  };
}

function viewerFrom(decision: Awaited<ReturnType<typeof resolveAccess>>): Viewer | null {
  if (!decision.granted) return null;
  return decision.role === "teacher"
    ? { role: "teacher" }
    : { role: "student", cohortId: decision.cohortId, cohortName: decision.cohortName };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // No session or user tables. The identity lives only in the encrypted session cookie,
  // so access can be re-checked; the Session exposed to the app carries only the Viewer.
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/no-access" },
  callbacks: {
    async signIn({ profile }) {
      const decision = await resolveAccess(db, identityFrom(profile), {
        teacherEmail: teacherEmail(),
      });
      return decision.granted ? true : `/no-access?reason=${decision.reason}`;
    },
    async jwt({ token, profile }) {
      const identity = profile ? identityFrom(profile) : (token.identity as GoogleIdentity | undefined);
      if (!identity) return null;
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (!profile && Date.now() - checkedAt < RECHECK_MS) return token;

      // On sign-in and every few minutes after: removing someone from the Roster,
      // or a Cohort ending, logs them out without waiting for the session to expire.
      const viewer = viewerFrom(
        await resolveAccess(db, identity, { teacherEmail: teacherEmail() }),
      );
      if (!viewer) return null;
      return { sub: token.sub, identity, viewer, checkedAt: Date.now() };
    },
    session({ session, token }) {
      return { expires: session.expires, viewer: token.viewer as Viewer | undefined } as typeof session;
    },
  },
});
