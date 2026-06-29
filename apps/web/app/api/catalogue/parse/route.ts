import { NextRequest, NextResponse } from "next/server";
import { ownerId } from "@/auth";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { parseCatalogueText, isVisionEnabled, type ParsedProduct, type CatalogueResult } from "@/lib/catalogue";
import { decodeAnyDataUrl } from "@/lib/file-store";
import { logger } from "@/lib/logger";

// Parse an uploaded catalogue file (CSV/TSV/text deterministically; PDF/image via
// a vision model only when CATALOGUE_VISION=1). Always degrades gracefully to
// "add manually" so onboarding never blocks on parsing.
export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("catalogue", ip, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: getRateLimitHeaders(rl) });

  const body = (await req.json().catch(() => null)) as { dataUrl?: string; fileName?: string } | null;
  const dataUrl = body?.dataUrl;
  if (!dataUrl) return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });

  const decoded = decodeAnyDataUrl(dataUrl);
  if (!decoded) return NextResponse.json({ error: "Unsupported file." }, { status: 400 });
  if (decoded.bytes.byteLength > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 12 MB)." }, { status: 413 });
  }

  const { contentType, bytes } = decoded;

  // 1. Text-based catalogues parse deterministically — no model, instant.
  if (/^text\/|csv|tab-separated/.test(contentType)) {
    const products = parseCatalogueText(bytes.toString("utf-8"));
    const result: CatalogueResult = products.length
      ? { products, parsed: true, note: `Found ${products.length} product${products.length === 1 ? "" : "s"}.` }
      : { products: [], parsed: false, note: "Couldn't read products from that file — add them manually." };
    return NextResponse.json(result);
  }

  // 2. PDF / image catalogues need vision. Off by default → graceful fallback.
  if (!isVisionEnabled()) {
    return NextResponse.json({
      products: [],
      parsed: false,
      note: "Saved your file. Tell me the products and prices and I'll add them.",
    } satisfies CatalogueResult);
  }

  try {
    const products = await parseWithVision(dataUrl, contentType);
    const result: CatalogueResult = products.length
      ? { products, parsed: true, note: `Extracted ${products.length} product${products.length === 1 ? "" : "s"} from your catalogue.` }
      : { products: [], parsed: false, note: "Couldn't extract products — tell me the items and prices." };
    return NextResponse.json(result);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "catalogue vision parse failed");
    return NextResponse.json({
      products: [], parsed: false, note: "Couldn't read that file — add the products manually.",
    } satisfies CatalogueResult);
  }
}

// Vision extraction via the same Anthropic-compatible endpoint used for generation.
async function parseWithVision(dataUrl: string, contentType: string): Promise<ParsedProduct[]> {
  const key = process.env.AI_API_KEY!;
  const base = (process.env.AI_BASE_URL ?? "").replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";
  const endpoint = base.endsWith("/anthropic") ? `${base}/v1/messages` : `${base}/anthropic/v1/messages`;
  const b64 = dataUrl.split(",")[1] ?? "";

  const source = contentType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: contentType, data: b64 } };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          source,
          { type: "text", text: 'Extract every product from this catalogue. Reply ONLY with a JSON array like [{"name":"...","price":499,"description":"..."}]. price is a number in rupees (omit if unknown). No prose, no code fences.' },
        ],
      }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  const json = await res.json() as { content?: Array<{ text?: string }> };
  const text = json.content?.[0]?.text ?? "[]";
  const cleaned = text.replace(/```json|```/g, "").trim();
  const arr = JSON.parse(cleaned) as Array<{ name?: string; price?: number; description?: string }>;
  return arr
    .filter((p) => p && typeof p.name === "string" && p.name.trim())
    .slice(0, 100)
    .map((p) => ({
      name: String(p.name).trim(),
      price: typeof p.price === "number" && p.price > 0 ? p.price : undefined,
      description: typeof p.description === "string" ? p.description.trim() || undefined : undefined,
    }));
}
