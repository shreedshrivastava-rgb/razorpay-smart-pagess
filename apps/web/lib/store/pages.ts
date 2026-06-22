import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import type { PageSchema } from "@/lib/schema/page-schema";
import { unstable_noStore as noStore } from "next/cache";
import { logger } from "@/lib/logger";
import {
  savePageDb,
  getPageDb,
  getPageEditTokenDb,
  isPageOwnerDb,
  getAllPagesDb,
  deletePageDb,
  updatePageDb,
  ensureUniqueSlugDb,
  publishPageDb,
  isDbAvailable,
} from "@/lib/db/pages-store";

// ─── Storage backend selection ──────────────────────────────────────────
// Priority: Database → Vercel Blob → File fallback

type StoredPage = PageSchema & { _editToken?: string; _ownerId?: string };

function ownsPage(stored: StoredPage, ownerId: string): boolean {
  if (stored._ownerId) return stored._ownerId === ownerId;
  const primary = process.env.PRIMARY_OWNER_EMAIL;
  return Boolean(primary) && primary === ownerId;
}

function blobAvailable() {
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

async function blobGetAll(ownerId?: string): Promise<PageSchema[]> {
  const { list, get } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "pages/" });
  const pages = await Promise.all(
    blobs.map(async (blob) => {
      try {
        const result = await get(blob.pathname, { access: "private" });
        if (!result?.stream) return null;
        const text = await readStream(result.stream);
        const stored = JSON.parse(text) as StoredPage;
        if (ownerId && !ownsPage(stored, ownerId)) return null;
        return stripToken(stored);
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
    const p = blobPath(slug, ns);
    const { blobs } = await list({ prefix: p });
    const blob = blobs.find((b) => b.pathname === p);
    if (blob) await del(blob.url);
  }
}

// ─── File fallback ───────────────────────────────────────────────────

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

// ─── Public API ──────────────────────────────────────────────────────

export async function savePage(page: PageSchema, editToken?: string, ownerId?: string): Promise<void> {
  logger.info({ slug: page.slug, id: page.id, owner: ownerId ?? "-" }, "savePage");

  if (isDbAvailable()) {
    await savePageDb(page, editToken, ownerId);
    return;
  }

  const meta = {
    ...(editToken ? { _editToken: editToken } : {}),
    ...(ownerId ? { _ownerId: ownerId } : {}),
  };

  if (blobAvailable()) {
    const baseSlug = page.slug;
    for (let attempt = 0; attempt < 10; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const stored: StoredPage = { ...meta, ...page, slug };
      const saved = await blobSaveRaw(stored, false);
      if (saved) {
        page.slug = slug;
        return;
      }
      const existing = await blobGet(slug);
      if (existing && existing.id === page.id) {
        await blobSaveRaw(stored, true);
        page.slug = slug;
        return;
      }
    }
    throw new Error("Could not save page: too many slug collisions");
  }

  return withLock(async () => {
    const stored: StoredPage = { ...meta, ...page };
    const pages = await readPages();
    pages[page.slug] = stored;
    await writePages(pages);
  });
}

export async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  if (isDbAvailable()) return ensureUniqueSlugDb(slug, excludeId);

  if (blobAvailable()) {
    const MAX_ATTEMPTS = 999;
    let candidate = slug;
    let counter = 2;
    while (true) {
      const taken = await blobGet(candidate);
      if (!taken) return candidate;
      if (taken.id === excludeId) return candidate;
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
  if (isDbAvailable()) return getPageDb(slug);
  if (blobAvailable()) return blobGet(slug);
  const pages = await readPages();
  const stored = pages[slug];
  return stored ? stripToken(stored) : null;
}

export async function getPageEditToken(slug: string): Promise<string | null> {
  noStore();
  if (isDbAvailable()) return getPageEditTokenDb(slug);
  if (blobAvailable()) {
    const raw = await blobGetRaw(slug);
    return raw?._editToken ?? null;
  }
  const pages = await readPages();
  return pages[slug]?._editToken ?? null;
}

export async function isPageOwner(slug: string, ownerId: string): Promise<boolean> {
  noStore();
  if (isDbAvailable()) return isPageOwnerDb(slug, ownerId);

  let stored: StoredPage | null | undefined;
  if (blobAvailable()) {
    stored = await blobGetRaw(slug);
  } else {
    const pages = await readPages();
    stored = pages[slug];
  }
  return stored ? ownsPage(stored, ownerId) : false;
}

export async function getAllPages(ownerId?: string): Promise<PageSchema[]> {
  if (isDbAvailable()) return getAllPagesDb(ownerId ?? undefined);
  if (blobAvailable()) return blobGetAll(ownerId);

  const pages = await readPages();
  return Object.values(pages)
    .filter((p) => !ownerId || ownsPage(p, ownerId))
    .map(stripToken)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function publishPage(slug: string, newSlug: string, editToken: string): Promise<PageSchema> {
  logger.info({ from: slug, to: newSlug }, "publishPage");

  if (isDbAvailable()) {
    return publishPageDb(slug, newSlug, editToken);
  }

  if (blobAvailable()) {
    const raw = await blobGetRaw(slug);
    if (!raw) throw new Error("Page not found");
    if (raw._editToken && raw._editToken !== editToken) throw new Error("Forbidden");

    const published: StoredPage = { ...raw, slug: newSlug, status: "published", updatedAt: new Date().toISOString() };
    await blobSaveRaw(published, true);

    const { list, del } = await import("@vercel/blob");
    for (const ns of ["draft", "live"] as const) {
      const oldPath = blobPath(slug, ns);
      if (oldPath === blobPath(newSlug, "live")) continue;
      const { blobs } = await list({ prefix: oldPath });
      const oldBlob = blobs.find((b) => b.pathname === oldPath);
      if (oldBlob) await del(oldBlob.url);
    }

    return stripToken(published);
  }

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
  logger.info({ slug }, "deletePage");
  if (isDbAvailable()) {
    await deletePageDb(slug);
    return;
  }
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
  if (isDbAvailable()) return updatePageDb(slug, updates, expectedUpdatedAt);

  if (blobAvailable()) {
    const raw = await blobGetRaw(slug);
    if (!raw) return null;
    if (expectedUpdatedAt && raw.updatedAt !== expectedUpdatedAt) {
      throw new Error("Conflict: page was modified by another request. Refresh and try again.");
    }
    const updated: StoredPage = { ...raw, ...updates, updatedAt: new Date().toISOString() };
    await blobSaveRaw(updated);
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
