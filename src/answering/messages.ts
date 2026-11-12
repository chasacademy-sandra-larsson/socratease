import type { UIMessage } from "ai";
import type { AnsweredSource, AnswerKind, Hint, UpcomingSource } from "./index";

/** What the chat UI receives about an answer besides its text. */
export type AnswerMetadata = {
  kind: AnswerKind;
  sources: AnsweredSource[];
  upcoming: UpcomingSource[];
  hint: Hint | null;
  /** A fixed reply saying the daily limit is reached; never sent back to the model. */
  limitReached?: true;
};

export type ChatMessage = UIMessage<AnswerMetadata>;
