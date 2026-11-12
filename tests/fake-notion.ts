import type { NotionBlock, NotionPage, NotionReader } from "../src/sync/notion";

/** A block in a fake page tree. A database block holds rows; any other block may hold children. */
export type FakeBlock = {
  id: string;
  type: string;
  text?: string;
  children?: FakeBlock[];
  rows?: FakePage[];
};

export type FakePage = {
  id: string;
  /** The page's last_edited_time; change it to simulate an edit between two syncs. */
  lastEdited?: string;
  /** The end of date ranges, by property, e.g. a Course's Period. */
  dateEnds?: NotionPage["dateEnds"];
  properties: NotionPage["properties"];
  children?: FakeBlock[];
};

/**
 * An in-memory Notion reader over a page tree shaped like FJS26. It records every id it is
 * asked about, and refuses ids that are not in the tree, so a test can prove nothing outside
 * the root is read. Results are paged like the Notion API, by default 100 at a time.
 */
export function createFakeNotion(rootId: string, root: FakeBlock[], { pageSize = 100 } = {}) {
  const children = new Map<string, FakeBlock[]>([[rootId, root]]);
  const rows = new Map<string, FakePage[]>();
  const index = (blocks: FakeBlock[]) => {
    for (const block of blocks) {
      if (block.children) {
        children.set(block.id, block.children);
        index(block.children);
      }
      if (block.rows) {
        rows.set(block.id, block.rows);
        for (const row of block.rows) {
          children.set(row.id, row.children ?? []);
          index(row.children ?? []);
        }
      }
    }
  };
  index(root);

  const requested: string[] = [];
  const page = <T>(items: T[], cursor?: string) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + pageSize;
    return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
  };

  const reader: NotionReader = {
    async listChildren(blockId, cursor) {
      requested.push(blockId);
      const blocks = children.get(blockId);
      if (!blocks) throw new Error(`Not shared with the integration: ${blockId}`);
      return page<NotionBlock>(
        blocks.map((b) => ({
          id: b.id,
          type: b.type,
          text: b.text ?? "",
          hasChildren: Boolean(b.children?.length),
        })),
        cursor,
      );
    },
    async queryDatabase(databaseId, cursor) {
      requested.push(databaseId);
      const pages = rows.get(databaseId);
      if (!pages) throw new Error(`Not shared with the integration: ${databaseId}`);
      return page<NotionPage>(
        pages.map((p) => ({
          id: p.id,
          url: `https://notion.example/${p.id}`,
          lastEditedTime: p.lastEdited ?? "2026-09-01T08:00:00.000Z",
          properties: p.properties,
          dateEnds: p.dateEnds ?? {},
        })),
        cursor,
      );
    },
  };
  return { reader, requested };
}
