import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { z } from "zod";
import { AiProviderNotConfiguredError, getModels } from "@/ai/models";
import { answer } from "@/answering";
import type { ChatMessage } from "@/answering/messages";
import { logsQuestions } from "@/access";
import { currentViewer } from "@/access/viewer";
import { db } from "@/db/client";
import { nextSession } from "@/material";
import { swedishToday } from "@/unlocking";
import { countMessage, dailyLimit, limitReachedMessage, refundMessage } from "@/usage";

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
    // The fixed "daily limit reached" reply is for the Student, not context for the model.
    .filter((m) => !(m.metadata as { limitReached?: boolean } | undefined)?.limitReached)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ ...m, parts: m.parts.filter(isTextPart) }) as ChatMessage);
  const last = messages.at(-1);
  const question = last?.parts.map((part) => (part.type === "text" ? part.text : "")).join("") ?? "";
  if (last?.role !== "user" || !question.trim()) return new Response("No question", { status: 400 });

  // The Teacher, also when viewing as a Student, has no limit. A real Student always has a key;
  // a session from before the limit existed has none, so it logs in again.
  const today = swedishToday();
  const counted = !viewer.viewingAsTeacher;
  if (counted) {
    if (!viewer.usageKey) return new Response("Log in again", { status: 401 });
    const limit = dailyLimit();
    const { allowed } = await countMessage(db, viewer.usageKey, today, limit);
    if (!allowed) return replyWith(messages, limitReachedMessage(limit, await nextSession(db, cohortId, today)));
  }
  // A message that gets no answer doesn't count against the limit.
  const refund = () => (counted && viewer.usageKey ? refundMessage(db, viewer.usageKey, today) : Promise.resolve());

  let models;
  try {
    models = await getModels();
  } catch (error) {
    await refund();
    if (error instanceof AiProviderNotConfiguredError) {
      return new Response("SocratEase har ingen AI-leverantör konfigurerad än.", { status: 503 });
    }
    throw error;
  }

  let answered;
  try {
    answered = await answer(
      { db, models },
      {
        question,
        conversation: await convertToModelMessages(messages.slice(0, -1)),
        cohortId,
        today,
        // The Question Log is for Students' questions; the Teacher's own tries would skew it.
        logQuestion: logsQuestions(viewer),
      },
    );
  } catch (error) {
    await refund();
    throw error;
  }
  const { kind, sources, upcoming, hint, result } = answered;

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }) => (part.type === "start" ? { kind, sources, upcoming, hint } : undefined),
    }),
  });
}

/** Answers with a fixed message instead of the model, e.g. once the daily limit is reached. */
function replyWith(originalMessages: ChatMessage[], text: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatMessage>({
      originalMessages,
      execute({ writer }) {
        writer.write({
          type: "start",
          messageMetadata: { kind: "uncovered", sources: [], upcoming: [], hint: null, limitReached: true },
        });
        writer.write({ type: "text-start", id: "reply" });
        writer.write({ type: "text-delta", id: "reply", delta: text });
        writer.write({ type: "text-end", id: "reply" });
      },
    }),
  });
}

function isTextPart(part: { type: string; text?: unknown }): part is { type: "text"; text: string } {
  return part.type === "text" && typeof part.text === "string";
}
