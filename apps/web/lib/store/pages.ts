import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import type { PageSchema } from "@/lib/schema/page-schema";

// Vercel's serverless runtime has a read-only filesystem except for /tmp
const DATA_DIR = process.env.VERCEL
  ? "/tmp/.smart-pages-data"
  : path.join(process.cwd(), ".data");
const PAGES_FILE = path.join(DATA_DIR, "pages.json");

// Module-level cache — survives across warm Lambda invocations within the same container.
// This is the primary store on Vercel; the /tmp file is a secondary persistence layer.
const memCache: Record<string, PageSchema> = {};

// Prevent concurrent reads+writes from corrupting pages.json
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
  // In-memory cache is always up-to-date within this container
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
  // Always update in-memory first so reads in the same container are instant
  Object.assign(memCache, pages);
  try {
    await ensureDataDir();
    const tmp = PAGES_FILE + ".tmp";
    await writeFile(tmp, JSON.stringify(pages, null, 2), "utf-8");
    const { rename } = await import("fs/promises");
    await rename(tmp, PAGES_FILE);
  } catch {
    // /tmp write failure is non-fatal — in-memory cache still serves this container
  }
}

export async function savePage(page: PageSchema): Promise<void> {
  return withLock(async () => {
    const pages = await readPages();
    pages[page.slug] = page;
    await writePages(pages);
  });
}

/** Returns a slug guaranteed not to collide with any existing page (except the one with excludeId). */
export async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<string> {
  const pages = await readPages();
  if (!pages[slug] || pages[slug].id === excludeId) return slug;
  let counter = 2;
  while (pages[`${slug}-${counter}`] && pages[`${slug}-${counter}`].id !== excludeId) counter++;
  return `${slug}-${counter}`;
}

export async function getPage(slug: string): Promise<PageSchema | null> {
  const pages = await readPages();
  return pages[slug] || null;
}

export async function getAllPages(): Promise<PageSchema[]> {
  const pages = await readPages();
  return Object.values(pages).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deletePage(slug: string): Promise<void> {
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
  return withLock(async () => {
    const pages = await readPages();
    if (!pages[slug]) return null;
    pages[slug] = { ...pages[slug], ...updates, updatedAt: new Date().toISOString() };
    await writePages(pages);
    return pages[slug];
  });
}
