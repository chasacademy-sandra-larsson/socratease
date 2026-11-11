import type { IsoDate } from "@/unlocking";

/**
 * A Notion block, reduced to what Sync needs. A database's or child page's title is its text. A
 * synced block that copies another one has the type "synced_block_reference".
 */
export type NotionBlock = { id: string; type: string; text: string; hasChildren: boolean };

/**
 * A row of a Notion database. Properties are reduced to plain values: title and text as a
 * string, a date as its start, a relation as the related page ids. Other types are null.
 */
export type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, string | IsoDate | string[] | null>;
};

export type Paged<T> = { items: T[]; nextCursor: string | null };

/**
 * Reads Notion one level at a time. It deliberately has no search: Sync may only reach what it
 * finds by walking down from a Cohort's root page (ADR 0007).
 */
export interface NotionReader {
  listChildren(blockId: string, cursor?: string): Promise<Paged<NotionBlock>>;
  queryDatabase(databaseId: string, cursor?: string): Promise<Paged<NotionPage>>;
}

// The API version whose databases endpoints the FJS26 databases are read through.
const NOTION_VERSION = "2022-06-28";
const MAX_RETRIES = 5;
// Notion allows about three requests a second, so at most three are in flight at a time.
const MAX_IN_FLIGHT = 3;

type RichText = { plain_text: string }[];

// The parts of the Notion API's responses that are read.
type ApiBlock = { id: string; type: string; has_children: boolean } & Record<
  string,
  { title?: string; rich_text?: RichText; synced_from?: object | null }
>;
type ApiProperty = {
  type: string;
  title?: RichText;
  rich_text?: RichText;
  date?: { start: string } | null;
  relation?: { id: string }[];
  select?: { name: string } | null;
};
type ApiPage = { id: string; url: string; public_url: string | null; properties: Record<string, ApiProperty> };
type ApiList<T> = { results: T[]; next_cursor: string | null };

/** A NotionReader over the Notion API, using SocratEase's own internal integration (ADR 0007). */
export function createNotionReader(token: string): NotionReader {
  const limit = concurrencyLimit(MAX_IN_FLIGHT);

  async function call<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const retry = async (seconds: number) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return call<T>(path, init, attempt + 1);
    };
    let response: Response;
    try {
      response = await limit(() =>
        fetch(`https://api.notion.com/v1/${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
        }),
      );
    } catch (error) {
      // A dropped connection passes too.
      if (attempt < MAX_RETRIES) return retry(2 ** attempt);
      throw error;
    }
    // Rate limits and server errors pass; wait as long as Notion asks, or back off, and try again.
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      return retry(Number(response.headers.get("Retry-After")) || 2 ** attempt);
    }
    const raw = await response.text();
    if (!response.ok) {
      let message = raw.slice(0, 200);
      try {
        message = JSON.parse(raw).message ?? message;
      } catch {
        // Not JSON, e.g. an HTML error page: keep the start of the text.
      }
      throw new Error(`Notion ${response.status} on ${path}: ${message}`);
    }
    return JSON.parse(raw);
  }

  return {
    async listChildren(blockId, cursor) {
      const query = new URLSearchParams({ page_size: "100", ...(cursor && { start_cursor: cursor }) });
      const body = await call<ApiList<ApiBlock>>(`blocks/${blockId}/children?${query}`);
      return {
        items: body.results.map((block) => {
          const content = block[block.type] ?? {};
          return {
            id: block.id,
            type: block.type === "synced_block" && content.synced_from ? "synced_block_reference" : block.type,
            text: typeof content.title === "string" ? content.title : plainText(content.rich_text),
            hasChildren: block.has_children,
          };
        }),
        nextCursor: body.next_cursor,
      };
    },
    async queryDatabase(databaseId, cursor) {
      const body = await call<ApiList<ApiPage>>(`databases/${databaseId}/query`, {
        method: "POST",
        body: JSON.stringify({ page_size: 100, ...(cursor && { start_cursor: cursor }) }),
      });
      return {
        items: body.results.map((page) => ({
          id: page.id,
          // Students reach the material through the published site, so link there when it exists.
          url: page.public_url ?? page.url,
          properties: Object.fromEntries(
            Object.entries(page.properties).map(([name, value]) => [name, propertyValue(value)]),
          ),
        })),
        nextCursor: body.next_cursor,
      };
    },
  };
}

function propertyValue(property: ApiProperty): NotionPage["properties"][string] {
  switch (property.type) {
    case "title":
      return plainText(property.title);
    case "rich_text":
      return plainText(property.rich_text);
    case "date":
      return property.date?.start ?? null;
    case "relation":
      return (property.relation ?? []).map((r) => r.id);
    case "select":
      return property.select?.name ?? null;
    default:
      return null;
  }
}

function plainText(richText: RichText | undefined): string {
  return (richText ?? []).map((t) => t.plain_text).join("");
}

/** Runs at most `max` of the given tasks at once; the rest wait in order. */
function concurrencyLimit(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
