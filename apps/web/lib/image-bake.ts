import type { PageSchema, ProductGridSection } from "@/lib/schema/page-schema";
import { generatedImageUrl, productImagePrompt, heroImagePrompt } from "@/lib/image-gen";
import { logger } from "@/lib/logger";

// Bakes the AI-generated images into permanent Vercel Blob storage so the live
// (published) page serves real CDN images instantly — no on-view generation,
// no load flash. Falls back to leaving the page untouched (the renderer keeps
// generating live) when Blob isn't configured (e.g. local dev).

function blobAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

// Generate (via Pollinations) → download → store in Blob → return public URL.
async function storeToBlob(sourceUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1000) return null; // too small to be a real image
    const { put } = await import("@vercel/blob");
    const { url } = await put(`generated/${key}.jpg`, buf, {
      access: "public",
      addRandomSuffix: true,
      contentType: "image/jpeg",
    });
    return url;
  } catch (err) {
    logger.warn({ key, err: err instanceof Error ? err.message : String(err) }, "image bake failed");
    return null;
  }
}

// Returns the image-field updates to persist, or null if nothing was baked.
export async function bakeGeneratedImages(page: PageSchema): Promise<Partial<PageSchema> | null> {
  if (!blobAvailable()) return null;

  const brandName = page.brand?.name ?? "";
  const updates: Partial<PageSchema> = {};
  const tasks: Promise<void>[] = [];

  if (page.pageType === "collection") {
    if (!page.productImageUrl) {
      const u = generatedImageUrl(heroImagePrompt(brandName, page.payment?.description), {
        width: 1280, height: 640, seedKey: `hero:${brandName}`,
      });
      tasks.push(storeToBlob(u, `${page.slug}-hero`).then((b) => { if (b) updates.productImageUrl = b; }));
    }
    // Clone sections so we can fill in item.imageUrl without mutating the input.
    const sections = page.sections.map((s) =>
      s.type === "product-grid" ? { ...s, items: s.items.map((it) => ({ ...it })) } : s
    );
    for (const s of sections) {
      if (s.type !== "product-grid") continue;
      for (const it of (s as ProductGridSection).items) {
        if (it.imageUrl) continue;
        const u = generatedImageUrl(productImagePrompt(it.name, brandName, it.description), {
          width: 600, height: 450, seedKey: `${brandName}:${it.name}`,
        });
        tasks.push(storeToBlob(u, `${page.slug}-${it.id}`).then((b) => { if (b) it.imageUrl = b; }));
      }
    }
    await Promise.allSettled(tasks);
    updates.sections = sections;
  } else if (!page.productImageUrl && page.payment?.name) {
    const u = generatedImageUrl(productImagePrompt(page.payment.name, brandName, page.payment.description), {
      width: 800, height: 600, seedKey: `${brandName}:${page.payment.name}`,
    });
    await Promise.allSettled([storeToBlob(u, `${page.slug}-product`).then((b) => { if (b) updates.productImageUrl = b; })]);
  }

  return Object.keys(updates).length ? updates : null;
}
