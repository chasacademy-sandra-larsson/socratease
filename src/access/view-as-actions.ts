"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db/client";
import { viewAs } from "./index";
import { VIEW_AS_COOKIE } from "./viewer";

/** The Teacher starts viewing SocratEase as a Student of the Cohort. Nobody else can. */
export async function startViewingAs(formData: FormData) {
  // The real, logged-in Viewer decides, never the one the Teacher is viewing as.
  const viewer = (await auth())?.viewer;
  if (viewer?.role !== "teacher") redirect("/");
  const cohortId = String(formData.get("cohortId") ?? "");
  // Only a Cohort that can be viewed as is saved; anything else would be a cookie that does nothing.
  if ((await viewAs(db, viewer, cohortId)).role !== "student") redirect("/");
  (await cookies()).set(VIEW_AS_COOKIE, cohortId, {
    httpOnly: true,
    sameSite: "lax",
    // Not over plain http on localhost in development, where some browsers drop Secure cookies.
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/");
}

/** Back to the Teacher view. */
export async function stopViewingAs() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect((await auth())?.viewer?.role === "teacher" ? "/larare" : "/");
}

/** Logs out, and ends viewing as a Student so the next login starts as the Teacher. */
export async function logOut() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  await signOut({ redirectTo: "/login" });
}
