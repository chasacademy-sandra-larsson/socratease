import type { UIMessage } from "ai";
import type { AnsweredSource, AnswerKind, UpcomingSource } from "./index";

/** What the chat UI receives about an answer besides its text. */
export type AnswerMetadata = { kind: AnswerKind; sources: AnsweredSource[]; upcoming: UpcomingSource[] };

export type ChatMessage = UIMessage<AnswerMetadata>;
