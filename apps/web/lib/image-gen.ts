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

export interface ImagePromptContext {
  brandName?: string;
  description?: string;   // product or business description
  bullets?: string[];     // feature/material hints
  businessType?: string;  // e.g. "leather goods store", "bakery"
}

// Builds a richer, more specific product prompt. Leads with the description and
// folds in material/feature hints + the business type so generic names produce
// an on-topic photo (the earlier prompt was too vague).
export function productImagePrompt(name: string, ctx: string | ImagePromptContext = {}): string {
  // Back-compat: a bare brandName string was the old 2nd arg.
  const c: ImagePromptContext = typeof ctx === "string" ? { brandName: ctx } : ctx;
  const desc = c.description?.trim();
  const hints = (c.bullets ?? []).filter(Boolean).slice(0, 3).join(", ");
  const subject = desc ? `${name} — ${desc}` : name;
  const parts = [
    `professional e-commerce product photography of ${subject}`,
    c.businessType ? `a ${c.businessType} product` : "",
    hints ? `featuring ${hints}` : "",
    c.brandName ? `for the brand ${c.brandName}` : "",
    "single product centered, clean seamless studio background, soft diffused lighting, sharp focus, high detail, realistic, no text, no watermark, no people",
  ].filter(Boolean);
  return parts.join(", ");
}

// Wide hero banner that evokes the actual business (e.g. a leather storefront),
// not a generic gradient.
export function heroImagePrompt(brandName: string, description?: string, businessType?: string): string {
  const subject = description?.trim() || businessType || brandName;
  const kind = businessType ? `${businessType} ` : "";
  return `${subject}, ${kind}lifestyle hero banner photography for ${brandName}, ` +
    `wide cinematic composition, on-brand, vibrant, professional, photorealistic, high detail, no text, no watermark`;
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

  const businessType = page.pageType === "collection" ? undefined : page.pageType;
  if (page.pageType === "collection") {
    urls.push(generatedImageUrl(heroImagePrompt(brandName, primaryDesc), {
      width: 1280, height: 640, seedKey: `hero:${brandName}`,
    }));
    for (const section of page.sections ?? []) {
      if (section.type !== "product-grid") continue;
      for (const item of section.items ?? []) {
        if (item.imageUrl) continue;
        urls.push(generatedImageUrl(
          productImagePrompt(item.name, { brandName, description: item.description, bullets: item.bullets }),
          // Seed by stable product id so a rename keeps the same image.
          { width: 600, height: 450, seedKey: `prod:${item.id}` },
        ));
      }
    }
  } else if (!page.productImageUrl && page.payment?.name) {
    urls.push(generatedImageUrl(
      productImagePrompt(page.payment.name, { brandName, description: primaryDesc, bullets: page.productBullets, businessType }),
      { width: 800, height: 600, seedKey: `${brandName}:${page.payment.name}` },
    ));
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
