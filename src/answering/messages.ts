import type { UIMessage } from "ai";
import type { AnsweredSource, AnswerKind } from "./index";

/** What the chat UI receives about an answer besides its text. */
export type AnswerMetadata = { kind: AnswerKind; sources: AnsweredSource[] };

export type ChatMessage = UIMessage<AnswerMetadata>;
