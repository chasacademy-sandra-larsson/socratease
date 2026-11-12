import { connection } from "next/server";
import { stopViewingAs } from "@/access/view-as-actions";
import { currentViewer } from "@/access/viewer";

/** Always shows when the Teacher is viewing as a Student, with a one-click way back. */
export async function ViewingAsBanner() {
  await connection();
  const viewer = await currentViewer();
  if (viewer?.role !== "student" || !viewer.viewingAsTeacher) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-900 dark:text-amber-50">
      <span>
        Du ser SocratEase som student i <strong>{viewer.cohortName}</strong>. Dina frågor sparas inte.
      </span>
      <form action={stopViewingAs}>
        <button className="underline">Tillbaka till lärarvyn</button>
      </form>
    </div>
  );
}
