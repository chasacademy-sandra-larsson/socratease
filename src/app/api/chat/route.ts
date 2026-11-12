import { convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { z } from "zod";
import { AiProviderNotConfiguredError, getModels } from "@/ai/models";
import { answer } from "@/answering";
import type { ChatMessage } from "@/answering/messages";
import { logsQuestions } from "@/access";
import { currentViewer } from "@/access/viewer";
import { db } from "@/db/client";
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
  // The Cohort the chat was shown for, so a Conversation never continues in another Cohort.
  cohortId: z.uuid(),
});

export async function POST(request: Request) {
  const viewer = await currentViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const body = parsed.data;

  // A Student, real or the Teacher viewing as one, always asks within their own Cohort.
  if (viewer.role !== "student") return new Response("View as a Student to use the chat", { status: 403 });
  const { cohortId } = viewer;
  // The Teacher may have switched Cohort or view in another tab since this chat was opened.
  if (body.cohortId !== cohortId) return new Response("The Cohort has changed; reload the page", { status: 409 });

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

  const { kind, sources, upcoming, hint, result } = await answer(
    { db, models },
    {
      question,
      conversation: await convertToModelMessages(messages.slice(0, -1)),
      cohortId,
      today: swedishToday(),
      // The Question Log is for Students' questions; the Teacher's own tries would skew it.
      logQuestion: logsQuestions(viewer),
    },
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }) => (part.type === "start" ? { kind, sources, upcoming, hint } : undefined),
    }),
  });
}

function isTextPart(part: { type: string; text?: unknown }): part is { type: "text"; text: string } {
  return part.type === "text" && typeof part.text === "string";
}
