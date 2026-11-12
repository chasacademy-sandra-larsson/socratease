import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { viewAs, type Viewer } from "./index";

/** Holds the Cohort the Teacher views SocratEase as a Student of. Ignored for anyone else. */
export const VIEW_AS_COOKIE = "socratease-view-as";

/**
 * The Viewer the request acts as, or null when not logged in (once per request): the logged-in Viewer, or, for the
 * Teacher viewing as a Student, that Student. Reads the session and view-as cookies.
 */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  const viewer = (await auth())?.viewer;
  if (!viewer) return null;
  return viewAs(db, viewer, (await cookies()).get(VIEW_AS_COOKIE)?.value ?? null);
});

/** The Viewer the request acts as, or a redirect to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  return viewer;
}
