// Builds image URLs for Pollinations — a free, no-API-key text-to-image service.
// The image is generated on first request to the URL and cached by prompt+seed,
// so we can point an <img>/background straight at it with no server call.

// Deterministic seed from a key so a given product/brand keeps the same image
// across reloads (instead of regenerating a different picture every time).
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
}

export function generatedImageUrl(
  prompt: string,
  opts: { width?: number; height?: number; seedKey?: string } = {}
): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 768;
  const seed = hashSeed(opts.seedKey ?? prompt);
  const clean = prompt.trim().replace(/\s+/g, " ").slice(0, 280);
  // Omit &model so Pollinations uses its fast default — the flux model can take
  // ~10s/image, too slow for several images on one page. The gradient+emoji
  // fallback covers the brief load either way.
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}` +
    `?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

// Prompt for a single product's photo, grounded in the brand context. Leads with
// the description so vague/brand-invented names (e.g. "Beddy") still produce a
// relevant image.
export function productImagePrompt(name: string, brandName?: string, description?: string): string {
  const desc = description?.trim();
  const subject = desc ? `${name}, ${desc}` : name;
  const ctx = brandName ? `, by ${brandName}` : "";
  return `professional product photography of ${subject}${ctx}, ` +
    `centered, clean studio background, soft lighting, high detail, photorealistic, no text, no watermark`;
}

// Prompt for a wide hero banner that evokes the brand/business.
export function heroImagePrompt(brandName: string, description?: string): string {
  const subject = description?.trim() || brandName;
  return `${subject}, lifestyle hero banner photography for ${brandName}, ` +
    `wide cinematic composition, vibrant, professional, photorealistic, no text, no watermark`;
}

import type { PageSchema } from "@/lib/schema/page-schema";

// The generated-image URLs a page will request when it has no uploaded photos.
// Used to pre-warm the Pollinations cache right after generation so the images
// are ready (or already rendering) by the time the creator views the page.
// MUST mirror the seedKey/size used in the renderer components or the warmed
// URL won't match what the page requests.
export function collectPageImageUrls(page: PageSchema): string[] {
  const urls: string[] = [];
  const brandName = page.brand?.name ?? "";
  const primaryDesc = page.payment?.description;

  if (page.pageType === "collection") {
    urls.push(generatedImageUrl(heroImagePrompt(brandName, primaryDesc), {
      width: 1280, height: 640, seedKey: `hero:${brandName}`,
    }));
    for (const section of page.sections ?? []) {
      if (section.type !== "product-grid") continue;
      for (const item of section.items ?? []) {
        if (item.imageUrl) continue;
        urls.push(generatedImageUrl(productImagePrompt(item.name, brandName, item.description), {
          width: 600, height: 450, seedKey: `${brandName}:${item.name}`,
        }));
      }
    }
  } else if (!page.productImageUrl && page.payment?.name) {
    urls.push(generatedImageUrl(productImagePrompt(page.payment.name, brandName, primaryDesc), {
      width: 800, height: 600, seedKey: `${brandName}:${page.payment.name}`,
    }));
  }
  return urls;
}

// Fire off the warm requests (best-effort, capped, never throws). Each GET
// triggers Pollinations to start generating + caching that image.
export async function warmImages(urls: string[]): Promise<void> {
  await Promise.allSettled(
    urls.slice(0, 8).map((url) =>
      fetch(url, { method: "GET", signal: AbortSignal.timeout(20_000) }).catch(() => undefined)
    )
  );
}
