"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import type { ChatMessage } from "@/answering/messages";
import { formatSwedishDate } from "@/unlocking";

/** `cohortId` is the Cohort the page was shown for; the server refuses a message for another one. */
export function Chat({ cohortId }: { cohortId: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat", body: { cohortId } }),
  });
  const busy = status !== "ready" && status !== "error";

  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) => (
        <div key={message.id} className={message.role === "user" ? "self-end max-w-[80%]" : "max-w-full"}>
          <div
            className={
              message.role === "user"
                ? "rounded-2xl bg-zinc-100 px-4 py-2 dark:bg-zinc-800"
                : "whitespace-pre-wrap leading-7"
            }
          >
            {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
          </div>
          {message.metadata?.hint?.bringToSession && (
            <p className="mt-2 text-sm text-zinc-500">
              Kör du fast? Ta med koden till{" "}
              {message.metadata.hint.nextSession
                ? `nästa pass den ${formatSwedishDate(message.metadata.hint.nextSession)}`
                : "nästa pass"}
              .
            </p>
          )}
          {message.metadata?.upcoming && message.metadata.upcoming.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-500">
              {message.metadata.upcoming.map((item, i) => (
                <li key={i}>
                  Kommer {formatSwedishDate(item.unlocksOn)}: {item.title}
                </li>
              ))}
            </ul>
          )}
          {message.metadata?.sources && message.metadata.sources.length > 0 && (
            <ol className="mt-2 flex flex-col gap-1 text-sm">
              {message.metadata.sources.map((source) => (
                <li key={source.number}>
                  [{source.number}]{" "}
                  <a href={source.url} target="_blank" rel="noreferrer" className="underline">
                    {source.title}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}

      {error && (
        <p className="text-red-700 dark:text-red-400">
          Något gick fel. Försök igen, eller ladda om sidan om du har bytt klass eller vy i en annan flik.
        </p>
      )}

      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => setMessages([])}
          disabled={busy}
          className="self-start text-sm text-zinc-500 underline disabled:opacity-40"
        >
          Nytt samtal
        </button>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ställ en fråga om kursmaterialet…"
          className="flex-1 rounded-full border px-4 py-2 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-black px-5 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          Fråga
        </button>
      </form>
    </div>
  );
}
