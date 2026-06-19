import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import type { PageSchema } from "@/lib/schema/page-schema";
import { unstable_noStore as noStore } from "next/cache";

// ─── Vercel Blob storage ──────────────────────────────────────────────────────
// When BLOB_READ_WRITE_TOKEN is set (Blob store connected), pages are stored as
// JSON objects in Blob. Falls back to in-memory + /tmp for local dev.

// StoredPage is what lives in the blob/file. The _editToken field is internal:
// it is never returned to callers of getPage() and never serialized to the client.
type StoredPage = PageSchema & { _editToken?: string };

function blobAvailable() {
  // BLOB_READ_WRITE_TOKEN: manual token (local dev / explicit setup)
  // VERCEL_OIDC_TOKEN + BLOB_STORE_ID: auto-injected by Vercel at runtime (production)
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

function blobPath(slug: string, namespace: "draft" | "live"): string {
  return namespace === "draft" ? `drafts/${slug}.json` : `pages/${slug}.json`;
}

async function blobSaveRaw(data: StoredPage, allowOverwrite = true): Promise<boolean> {
  const { put } = await import("@vercel/blob");
  const namespace = data.status === "draft" ? "draft" : "live";
  try {
    await put(blobPath(data.slug, namespace), JSON.stringify(data), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite,
      contentType: "application/json",
    });
    return true;
  } catch (err: unknown) {
    if (!allowOverwrite && err instanceof Error && err.message.toLowerCase().includes("already exists")) return false;
    throw err;
  }
}

async function readStream(stream: ReadableStream): Promise<string> {
  const text = await Promise.race([
    new Response(stream).text(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Blob stream read timed out after 10s")), 10_000)
    ),
  ]);
  return text;
}

async function blobGetRaw(slug: string): Promise<StoredPage | null> {
  const { get } = await import("@vercel/blob");
  // Try live namespace first, fall back to draft
  for (const ns of ["live", "draft"] as const) {
    const result = await get(blobPath(slug, ns), { access: "private", useCache: false });
    if (result?.stream) {
      const text = await readStream(result.stream);
      return JSON.parse(text) as StoredPage;
    }
  }
  return null;
}

function stripToken(stored: StoredPage): PageSchema {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _editToken, ...page } = stored;
  return page;
}

async function blobGet(slug: string): Promise<PageSchema | null> {
  const raw = await blobGetRaw(slug);
  return raw ? stripToken(raw) : null;
}

async function blobGetAll(): Promise<PageSchema[]> {
  const { list, get } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "pages/" });
  const pages = await Promise.all(
    blobs.map(async (blob) => {
      try {
        const result = await get(blob.pathname, { access: "private" });
        if (!result?.stream) return null;
        const text = await readStream(result.stream);
        return stripToken(JSON.parse(text) as StoredPage);
      } catch {
        return null;
      }
    })
  );
  return (pages.filter(Boolean) as PageSchema[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

async function blobDelete(slug: string): Promise<void> {
  const { list, del } = await import("@vercel/blob");
  for (const ns of ["live", "draft"] as const) {
    const path = blobPath(slug, ns);
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (blob) await del(blob.url);
  }
}

async function blobSlugExists(slug: string, excludeId?: string): Promise<boolean> {
  const page = await blobGet(slug);
  if (!page) return false;
  return page.id !== excludeId;
}

// ─── File / memory fallback ───────────────────────────────────────────────────

const DATA_DIR = process.env.VERCEL
  ? "/tmp/.smart-pages-data"
  : path.join(process.cwd(), ".data");
const PAGES_FILE = path.join(DATA_DIR, "pages.json");
const memCache: Record<string, StoredPage> = {};

let writeLock: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const prev = writeLock;
  writeLock = new Promise((resolve) => { release = resolve; });
  return prev.then(() => fn()).finally(() => release());
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readPages(): Promise<Record<string, StoredPage>> {
  if (Object.keys(memCache).length > 0) return memCache;
  try {
    const content = await readFile(PAGES_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, StoredPage>;
    Object.assign(memCache, parsed);
    return memCache;
  } catch {
    return {};
  }
}

async function writePages(pages: Record<string, StoredPage>) {
  Object.assign(memCache, pages);
  try {
    await ensureDataDir();
    const tmp = PAGES_FILE + ".tmp";
    await writeFile(tmp, JSON.stringify(pages, null, 2), "utf-8");
    const { rename } = await import("fs/promises");
    await rename(tmp, PAGES_FILE);
  } catch { /* non-fatal */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function savePage(page: PageSchema, editToken?: string): Promise<void> {
  console.log(`[audit] savePage slug="${page.slug}" id="${page.id}" at=${new Date().toISOString()}`);
  if (blobAvailable()) {
    const baseSlug = page.slug;
    for (let attempt = 0; attempt < 10; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const stored: StoredPage = editToken ? { _editToken: editToken, ...page, slug } : { ...page, slug };
      const saved = await blobSaveRaw(stored, false);
      if (saved) {
        page.slug = slug;
        return;
      }
      // Collision: if the existing blob belongs to the same page (regeneration), overwrite it
      const existing = await blobGet(slug);
      if (existing && existing.id === page.id) {
        await blobSaveRaw(stored, true);
        page.slug = slug;
        return;
      }
      // Different page owns this slug — try next suffix
    }
    throw new Error("Could not save page: too many slug collisions");
  }
  return withLock(async () => {
    const stored: StoredPage = editToken ? { _editToken: editToken, ...page } : page;
    const pages = await readPages();
    pages[page.slug] = stored;
    await writePages(pages);
  });
}

export async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  if (blobAvailable()) {
    const MAX_ATTEMPTS = 999;
    let candidate = slug;
    let counter = 2;
    while (true) {
      const taken = await blobSlugExists(candidate, excludeId);
      if (!taken) return candidate;
      if (counter > MAX_ATTEMPTS) throw new Error("Could not generate a unique slug after 999 attempts");
      candidate = `${slug}-${counter++}`;
    }
  }
  const pages = await readPages();
  if (!pages[slug] || pages[slug].id === excludeId) return slug;
  const MAX_LOCAL = 999;
  let counter = 2;
  while (counter <= MAX_LOCAL && pages[`${slug}-${counter}`] && pages[`${slug}-${counter}`].id !== excludeId) counter++;
  if (counter > MAX_LOCAL) throw new Error("Could not generate a unique slug after 999 attempts");
  return `${slug}-${counter}`;
}

export async function getPage(slug: string): Promise<PageSchema | null> {
  noStore();
  if (blobAvailable()) return blobGet(slug);
  const pages = await readPages();
  const stored = pages[slug];
  return stored ? stripToken(stored) : null;
}

export async function getPageEditToken(slug: string): Promise<string | null> {
  noStore();
  if (blobAvailable()) {
    const raw = await blobGetRaw(slug);
    return raw?._editToken ?? null;
  }
  const pages = await readPages();
  return pages[slug]?._editToken ?? null;
}

export async function getAllPages(): Promise<PageSchema[]> {
  if (blobAvailable()) return blobGetAll();
  const pages = await readPages();
  return Object.values(pages).map(stripToken).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Moves a draft to the live namespace and marks it published.
// newSlug allows renaming the slug at publish time (the creator picks the final URL).
export async function publishPage(slug: string, newSlug: string, editToken: string): Promise<PageSchema> {
  console.log(`[audit] publishPage from="${slug}" to="${newSlug}" at=${new Date().toISOString()}`);
  if (blobAvailable()) {
    const raw = await blobGetRaw(slug);
    if (!raw) throw new Error("Page not found");
    // Allow publish for unprotected legacy pages (no stored token)
    if (raw._editToken && raw._editToken !== editToken) throw new Error("Forbidden");

    const published: StoredPage = { ...raw, slug: newSlug, status: "published", updatedAt: new Date().toISOString() };
    // Write to live namespace using allowOverwrite: true since ensureUniqueSlug already checked uniqueness
    await blobSaveRaw(published, true);

    // Remove the old blob (draft or live, in case of a same-slug publish)
    const { list, del } = await import("@vercel/blob");
    for (const ns of ["draft", "live"] as const) {
      const oldPath = blobPath(slug, ns);
      // Don't delete the blob we just wrote (same slug, same namespace)
      if (oldPath === blobPath(newSlug, "live")) continue;
      const { blobs } = await list({ prefix: oldPath });
      const oldBlob = blobs.find((b) => b.pathname === oldPath);
      if (oldBlob) await del(oldBlob.url);
    }

    return stripToken(published);
  }
  // File fallback: just update status and rename
  return withLock(async () => {
    const pages = await readPages();
    const stored = pages[slug];
    if (!stored) throw new Error("Page not found");
    if (stored._editToken !== editToken) throw new Error("Forbidden");
    delete pages[slug];
    const published: StoredPage = { ...stored, slug: newSlug, status: "published", updatedAt: new Date().toISOString() };
    pages[newSlug] = published;
    await writePages(pages);
    return stripToken(published);
  });
}

export async function deletePage(slug: string): Promise<void> {
  console.log(`[audit] deletePage slug="${slug}" at=${new Date().toISOString()}`);
  if (blobAvailable()) {
    await blobDelete(slug);
    return;
  }
  return withLock(async () => {
    const pages = await readPages();
    delete pages[slug];
    delete memCache[slug];
    await writePages(pages);
  });
}

export async function updatePage(
  slug: string,
  updates: Partial<PageSchema>,
  expectedUpdatedAt?: string
): Promise<PageSchema | null> {
  if (blobAvailable()) {
    // Use raw read to preserve _editToken through the update
    const raw = await blobGetRaw(slug);
    if (!raw) return null;
    if (expectedUpdatedAt && raw.updatedAt !== expectedUpdatedAt) {
      throw new Error("Conflict: page was modified by another request. Refresh and try again.");
    }
    const updated: StoredPage = { ...raw, ...updates, updatedAt: new Date().toISOString() };
    await blobSaveRaw(updated);
    console.log(`[audit] updatePage slug="${slug}" at=${updated.updatedAt}`);
    return stripToken(updated);
  }
  return withLock(async () => {
    const pages = await readPages();
    if (!pages[slug]) return null;
    if (expectedUpdatedAt && pages[slug].updatedAt !== expectedUpdatedAt) {
      throw new Error("Conflict: page was modified by another request. Refresh and try again.");
    }
    pages[slug] = { ...pages[slug], ...updates, updatedAt: new Date().toISOString() };
    await writePages(pages);
    return stripToken(pages[slug]);
  });
}
