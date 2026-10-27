import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Viewer } from "./index";

/** The logged-in Viewer, or a redirect to the login page. Reads the session cookie. */
export async function requireViewer(): Promise<Viewer> {
  const session = await auth();
  if (!session?.viewer) redirect("/login");
  return session.viewer;
}
