import { convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AiProviderNotConfiguredError, getModels } from "@/ai/models";
import { answer } from "@/answering";
import type { ChatMessage } from "@/answering/messages";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { cohorts } from "@/db/schema";
import { swedishToday } from "@/unlocking";

export const maxDuration = 60;

/** Only the latest turns are sent back to the model; keeps cost and prompt size bounded. */
const MAX_HISTORY_MESSAGES = 12;

const messageSchema = z.looseObject({
  role: z.string(),
  parts: z.array(z.looseObject({ type: z.string() })),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1),
  cohortId: z.uuid().optional(),
});

export async function POST(request: Request) {
  const viewer = (await auth())?.viewer;
  if (!viewer) return new Response("Unauthorized", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const body = parsed.data;

  // A Student always answers within their own Cohort. The Teacher picks one (until #20).
  let cohortId: string;
  if (viewer.role === "student") {
    cohortId = viewer.cohortId;
  } else {
    const [cohort] = body.cohortId
      ? await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.id, body.cohortId))
      : [];
    if (!cohort) return new Response("Choose a Cohort", { status: 400 });
    cohortId = cohort.id;
  }

  // The history comes from the browser (Conversations aren't stored, ADR 0003), so keep only
  // the latest turns and only their text; files and other parts never reach the model.
  // The instructions, not the history, decide what may be taught.
  const messages = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ ...m, parts: m.parts.filter(isTextPart) }) as ChatMessage);
  const last = messages.at(-1);
  const question = last?.parts.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
  if (last?.role !== "user" || !question.trim()) return new Response("No question", { status: 400 });

  let models;
  try {
    models = await getModels();
  } catch (error) {
    if (error instanceof AiProviderNotConfiguredError) {
      return new Response("SocratEase har ingen AI-leverantör konfigurerad än.", { status: 503 });
    }
    throw error;
  }

  const { kind, sources, upcoming, result } = await answer(
    { db, models },
    {
      question,
      conversation: await convertToModelMessages(messages.slice(0, -1)),
      cohortId,
      today: swedishToday(),
      // The Question Log is for Students' questions; the Teacher's own tries would skew it.
      logQuestion: viewer.role === "student",
    },
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }) => (part.type === "start" ? { kind, sources, upcoming } : undefined),
    }),
  });
}

function isTextPart(part: { type: string; text?: unknown }): part is { type: "text"; text: string } {
  return part.type === "text" && typeof part.text === "string";
}
