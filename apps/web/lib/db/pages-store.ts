import { getDb, type Db } from "./connection";
import type { PageSchema } from "@/lib/schema/page-schema";
import { logger } from "@/lib/logger";

interface StoredPage {
  id: string;
  slug: string;
  status: string;
  owner_email: string | null;
  edit_token: string | null;
  page_data: PageSchema;
  created_at: Date;
  updated_at: Date;
}

function rowToPage(row: StoredPage): PageSchema {
  // _chat is the owner's private conversation persisted inside page_data — never
  // expose it on the public page object. Read it via getPageChatDb instead.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _chat, ...data } = row.page_data as PageSchema & { _chat?: unknown };
  return {
    ...data,
    id: row.id,
    slug: row.slug,
    status: row.status as PageSchema["status"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isDbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getOwnerEmail(): string | null {
  return process.env.PRIMARY_OWNER_EMAIL ?? null;
}

export async function savePageDb(page: PageSchema, editToken?: string, ownerEmail?: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  const email = ownerEmail ?? getOwnerEmail();
  const owner = email ?? undefined;

  logger.info({ slug: page.slug, id: page.id, owner: owner ?? "-" }, "DB savePage");

  await db`
    INSERT INTO pages (id, slug, status, owner_email, edit_token, page_data, created_at, updated_at)
    VALUES (
      ${page.id},
      ${page.slug},
      ${page.status},
      ${owner ?? null},
      ${editToken ?? null},
      ${db.json(page)},
      ${new Date(page.createdAt)},
      ${new Date(page.updatedAt)}
    )
    ON CONFLICT (slug) DO UPDATE SET
      status = EXCLUDED.status,
      owner_email = COALESCE(pages.owner_email, EXCLUDED.owner_email),
      edit_token = COALESCE(EXCLUDED.edit_token, pages.edit_token),
      page_data = EXCLUDED.page_data,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function getPageDb(slug: string): Promise<PageSchema | null> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  const rows = await db<StoredPage[]>`
    SELECT * FROM pages WHERE slug = ${slug}
  `;

  if (rows.length === 0) return null;
  return rowToPage(rows[0]);
}

export async function getPageEditTokenDb(slug: string): Promise<string | null> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  const rows = await db<Pick<StoredPage, "edit_token">[]>`
    SELECT edit_token FROM pages WHERE slug = ${slug}
  `;

  return rows[0]?.edit_token ?? null;
}

export async function isPageOwnerDb(slug: string, ownerEmail: string): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  const rows = await db<Pick<StoredPage, "owner_email">[]>`
    SELECT owner_email FROM pages WHERE slug = ${slug}
  `;

  if (rows.length === 0) return false;
  const stored = rows[0].owner_email;
  if (stored) return stored === ownerEmail;
  const primary = getOwnerEmail();
  return Boolean(primary) && primary === ownerEmail;
}

export async function getAllPagesDb(ownerEmail?: string): Promise<PageSchema[]> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  let rows: StoredPage[];
  if (ownerEmail) {
    rows = await db<StoredPage[]>`
      SELECT * FROM pages
      WHERE owner_email = ${ownerEmail}
      ORDER BY updated_at DESC
    `;
  } else {
    rows = await db<StoredPage[]>`
      SELECT * FROM pages ORDER BY updated_at DESC
    `;
  }

  return rows.map(rowToPage);
}

export async function deletePageDb(slug: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  logger.info({ slug }, "DB deletePage");
  await db`DELETE FROM pages WHERE slug = ${slug}`;
}

export async function updatePageDb(
  slug: string,
  updates: Partial<PageSchema>,
  expectedUpdatedAt?: string
): Promise<PageSchema | null> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  // Read the RAW page_data (keeps internal fields like _chat that rowToPage
  // strips) so merging updates doesn't silently wipe the saved conversation.
  const rows = await db<{ page_data: Record<string, unknown> }[]>`
    SELECT page_data FROM pages WHERE slug = ${slug}
  `;
  if (rows.length === 0) return null;
  const existing = await getPageDb(slug);
  if (!existing) return null;

  if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
    throw new Error("Conflict: page was modified by another request. Refresh and try again.");
  }

  const updatedAt = new Date().toISOString();
  const mergedRaw = { ...rows[0].page_data, ...updates, updatedAt };
  const merged: PageSchema = { ...existing, ...updates, updatedAt };

  await db`
    UPDATE pages SET
      page_data = ${db.json(mergedRaw as never)},
      status = ${merged.status},
      updated_at = ${new Date(updatedAt)}
    WHERE slug = ${slug}
  `;

  return merged;
}

export async function ensureUniqueSlugDb(slug: string, excludeId?: string): Promise<string> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  const MAX_ATTEMPTS = 999;
  let candidate = slug;
  let counter = 2;

  while (true) {
    const rows = await db<Pick<StoredPage, "id">[]>`
      SELECT id FROM pages WHERE slug = ${candidate}
    `;

    if (rows.length === 0) return candidate;
    if (excludeId && rows[0]?.id === excludeId) return candidate;

    if (counter > MAX_ATTEMPTS) throw new Error("Could not generate a unique slug after 999 attempts");
    candidate = `${slug}-${counter++}`;
  }
}

export async function publishPageDb(
  slug: string,
  newSlug: string,
  editToken: string
): Promise<PageSchema> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");

  // Read the raw row so we keep owner_email, edit_token, and page_data._chat
  // through publish — nulling them stranded the page (owner lost access) and
  // wiped the conversation on the DB backend.
  const rows = await db<{ page_data: Record<string, unknown>; owner_email: string | null; edit_token: string | null }[]>`
    SELECT page_data, owner_email, edit_token FROM pages WHERE slug = ${slug}
  `;
  if (rows.length === 0) throw new Error("Page not found");
  const { page_data: rawPageData, owner_email, edit_token } = rows[0];

  const storedToken = edit_token;
  if (storedToken && storedToken !== editToken) throw new Error("Forbidden");

  const existing = await getPageDb(slug);
  if (!existing) throw new Error("Page not found");

  const published: PageSchema = {
    ...existing,
    slug: newSlug,
    status: "published",
    updatedAt: new Date().toISOString(),
  };
  const publishedRaw = { ...rawPageData, slug: newSlug, status: "published", updatedAt: published.updatedAt };

  if (newSlug !== slug) {
    await db`DELETE FROM pages WHERE slug = ${slug}`;
  }

  await db`
    INSERT INTO pages (id, slug, status, owner_email, edit_token, page_data, created_at, updated_at)
    VALUES (
      ${published.id},
      ${published.slug},
      ${published.status},
      ${owner_email},
      ${edit_token},
      ${db.json(publishedRaw as never)},
      ${new Date(published.createdAt)},
      ${new Date(published.updatedAt)}
    )
    ON CONFLICT (slug) DO UPDATE SET
      status = EXCLUDED.status,
      owner_email = COALESCE(pages.owner_email, EXCLUDED.owner_email),
      edit_token = EXCLUDED.edit_token,
      page_data = EXCLUDED.page_data,
      updated_at = EXCLUDED.updated_at
  `;

  return published;
}

// Persist the owner's chat conversation inside page_data under `_chat`. Done as
// a read-modify-write so it works whether page_data is json or jsonb.
export async function saveChatDb(slug: string, chat: unknown): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const rows = await db<{ page_data: Record<string, unknown> }[]>`
    SELECT page_data FROM pages WHERE slug = ${slug}
  `;
  if (rows.length === 0) return;
  const pageData = { ...rows[0].page_data, _chat: chat };
  await db`UPDATE pages SET page_data = ${db.json(pageData as never)} WHERE slug = ${slug}`;
}

export async function getPageOwnerIdDb(slug: string): Promise<string | null> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const rows = await db<Pick<StoredPage, "owner_email">[]>`
    SELECT owner_email FROM pages WHERE slug = ${slug}
  `;
  return rows[0]?.owner_email ?? getOwnerEmail();
}

export async function getPageChatDb(slug: string): Promise<unknown | null> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const rows = await db<{ page_data: Record<string, unknown> }[]>`
    SELECT page_data FROM pages WHERE slug = ${slug}
  `;
  return rows[0]?.page_data?._chat ?? null;
}

export { isDbAvailable };
