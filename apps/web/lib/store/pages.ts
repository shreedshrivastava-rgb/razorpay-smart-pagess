import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import type { PageSchema } from "@/lib/schema/page-schema";

// ─── Vercel Blob storage ──────────────────────────────────────────────────────
// When BLOB_READ_WRITE_TOKEN is set (Blob store connected), pages are stored as
// JSON objects in Blob. Falls back to in-memory + /tmp for local dev.

function blobAvailable() {
  // BLOB_READ_WRITE_TOKEN: manual token (local dev / explicit setup)
  // VERCEL_OIDC_TOKEN + BLOB_STORE_ID: auto-injected by Vercel at runtime (production)
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

async function blobSave(page: PageSchema): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(`pages/${page.slug}.json`, JSON.stringify(page), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function blobGet(slug: string): Promise<PageSchema | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(`pages/${slug}.json`, { access: "private" });
  if (!result) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as PageSchema;
}

async function blobGetAll(): Promise<PageSchema[]> {
  const { list, get } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "pages/" });
  const pages = await Promise.all(
    blobs.map(async (blob) => {
      try {
        const result = await get(blob.pathname, { access: "private" });
        if (!result) return null;
        const text = await new Response(result.stream).text();
        return JSON.parse(text) as PageSchema;
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
  const { blobs } = await list({ prefix: `pages/${slug}.json` });
  const blob = blobs.find((b) => b.pathname === `pages/${slug}.json`);
  if (blob) await del(blob.url);
}

async function blobSlugExists(slug: string, excludeId?: string): Promise<boolean> {
  const page = await blobGet(slug);
  if (!page) return false;
  return page.id !== excludeId;
}

// In-flight slug lock — prevents same-instance concurrent saves from racing to the same slug.
// Not a substitute for distributed locking, but catches the common case on a single Lambda.
const slugsInFlight = new Set<string>();

// ─── File / memory fallback ───────────────────────────────────────────────────

const DATA_DIR = process.env.VERCEL
  ? "/tmp/.smart-pages-data"
  : path.join(process.cwd(), ".data");
const PAGES_FILE = path.join(DATA_DIR, "pages.json");
const memCache: Record<string, PageSchema> = {};

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

async function readPages(): Promise<Record<string, PageSchema>> {
  if (Object.keys(memCache).length > 0) return memCache;
  try {
    const content = await readFile(PAGES_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, PageSchema>;
    Object.assign(memCache, parsed);
    return memCache;
  } catch {
    return {};
  }
}

async function writePages(pages: Record<string, PageSchema>) {
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

export async function savePage(page: PageSchema): Promise<void> {
  if (blobAvailable()) {
    await blobSave(page);
    return;
  }
  return withLock(async () => {
    const pages = await readPages();
    pages[page.slug] = page;
    await writePages(pages);
  });
}

export async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  if (blobAvailable()) {
    const MAX_ATTEMPTS = 999;
    let candidate = slug;
    let counter = 2;
    while (true) {
      const taken = slugsInFlight.has(candidate) || (await blobSlugExists(candidate, excludeId));
      if (!taken) {
        slugsInFlight.add(candidate);
        // Release the lock after 15 s — long enough for savePage to complete
        setTimeout(() => slugsInFlight.delete(candidate), 15_000);
        return candidate;
      }
      if (counter > MAX_ATTEMPTS) throw new Error("Could not generate a unique slug after 999 attempts");
      candidate = `${slug}-${counter++}`;
    }
  }
  const pages = await readPages();
  if (!pages[slug] || pages[slug].id === excludeId) return slug;
  let counter = 2;
  while (pages[`${slug}-${counter}`] && pages[`${slug}-${counter}`].id !== excludeId) counter++;
  return `${slug}-${counter}`;
}

export async function getPage(slug: string): Promise<PageSchema | null> {
  if (blobAvailable()) return blobGet(slug);
  const pages = await readPages();
  return pages[slug] || null;
}

export async function getAllPages(): Promise<PageSchema[]> {
  if (blobAvailable()) return blobGetAll();
  const pages = await readPages();
  return Object.values(pages).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deletePage(slug: string): Promise<void> {
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
  updates: Partial<PageSchema>
): Promise<PageSchema | null> {
  if (blobAvailable()) {
    const page = await blobGet(slug);
    if (!page) return null;
    const updated = { ...page, ...updates, updatedAt: new Date().toISOString() };
    await blobSave(updated);
    return updated;
  }
  return withLock(async () => {
    const pages = await readPages();
    if (!pages[slug]) return null;
    pages[slug] = { ...pages[slug], ...updates, updatedAt: new Date().toISOString() };
    await writePages(pages);
    return pages[slug];
  });
}
