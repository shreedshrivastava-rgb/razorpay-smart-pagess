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

// Prompt for a single product's photo, grounded in the brand context.
export function productImagePrompt(name: string, brandName?: string, description?: string): string {
  const ctx = [description, brandName].filter(Boolean).join(", ");
  return `professional product photography of ${name}${ctx ? `, ${ctx}` : ""}, ` +
    `centered, clean studio background, soft lighting, high detail, photorealistic, no text, no watermark`;
}

// Prompt for a wide hero banner that evokes the brand/business.
export function heroImagePrompt(brandName: string, description?: string): string {
  const subject = description?.trim() || brandName;
  return `${subject}, lifestyle hero banner photography for ${brandName}, ` +
    `wide cinematic composition, vibrant, professional, photorealistic, no text, no watermark`;
}
