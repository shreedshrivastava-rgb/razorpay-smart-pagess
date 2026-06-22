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
  return {
    ...row.page_data,
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

  const existing = await getPageDb(slug);
  if (!existing) return null;

  if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
    throw new Error("Conflict: page was modified by another request. Refresh and try again.");
  }

  const merged: PageSchema = { ...existing, ...updates, updatedAt: new Date().toISOString() };

  await db`
    UPDATE pages SET
      page_data = ${db.json(merged)},
      status = ${merged.status},
      updated_at = ${new Date(merged.updatedAt)}
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

  const existing = await getPageDb(slug);
  if (!existing) throw new Error("Page not found");

  const storedToken = await getPageEditTokenDb(slug);
  if (storedToken && storedToken !== editToken) throw new Error("Forbidden");

  const published: PageSchema = {
    ...existing,
    slug: newSlug,
    status: "published",
    updatedAt: new Date().toISOString(),
  };

  if (newSlug !== slug) {
    await db`DELETE FROM pages WHERE slug = ${slug}`;
  }

  await db`
    INSERT INTO pages (id, slug, status, owner_email, edit_token, page_data, created_at, updated_at)
    VALUES (
      ${published.id},
      ${published.slug},
      ${published.status},
      ${null},
      ${null},
      ${db.json(published)},
      ${new Date(published.createdAt)},
      ${new Date(published.updatedAt)}
    )
    ON CONFLICT (slug) DO UPDATE SET
      status = EXCLUDED.status,
      page_data = EXCLUDED.page_data,
      updated_at = EXCLUDED.updated_at,
      edit_token = NULL
  `;

  return published;
}

export { isDbAvailable };
