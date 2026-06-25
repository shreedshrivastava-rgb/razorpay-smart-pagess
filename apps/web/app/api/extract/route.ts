import { NextRequest, NextResponse } from "next/server";
import { isValidUrl } from "@/lib/utils";
import { extractBrand, extractProduct } from "@/lib/extract/jina";
import { logger } from "@/lib/logger";
import { ownerId } from "@/auth";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { checkCsrf } from "@/lib/csrf";

// Auth + per-owner rate limit shared by both extract handlers — they proxy a
// billable upstream (Jina), so cap usage per account.
async function guard(): Promise<NextResponse | string> {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await checkRateLimit("extract", owner, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rl) }
    );
  }
  return owner;
}

function normalizeAndValidate(raw: string): { url: string } | { error: string; status: number } {
  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
  if (!isValidUrl(normalized)) return { error: "Invalid URL", status: 400 };
  const { hostname } = new URL(normalized);
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (
    h === "localhost" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    /^fe[89ab][0-9a-f]:/i.test(h) || // link-local fe80::/10
    /^f[cd][0-9a-f]{2}:/i.test(h) ||  // ULA fc00::/7
    h.startsWith("127.") ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    h.startsWith("169.254.") ||       // link-local
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) || // 172.16–31
    /^\d+$/.test(h) ||                 // integer-form IP (e.g. 2130706433)
    h.startsWith("0x")                 // hex-form IP (e.g. 0x7f000001)
  ) {
    return { error: "Private URLs not allowed", status: 400 };
  }
  return { url: normalized };
}

// GET /api/extract?url=... — used by Step3Details for product extraction
export async function GET(req: NextRequest) {
  const g = await guard();
  if (g instanceof NextResponse) return g;
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  if (!raw) return NextResponse.json({ error: "url param required" }, { status: 400 });

  const result = normalizeAndValidate(raw);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    const product = await extractProduct(result.url);
    return NextResponse.json(product);
  } catch (err) {
    logger.error({ err }, "product extraction error");
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

// POST /api/extract — used by Step1Import for brand/website extraction
export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const g = await guard();
  if (g instanceof NextResponse) return g;
  let raw: string;
  try {
    const body = await req.json() as { url?: string };
    raw = body.url ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!raw) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  const result = normalizeAndValidate(raw);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    const extracted = await extractBrand(result.url);
    return NextResponse.json({ success: true, data: extracted });
  } catch (error) {
    logger.error({ err: error }, "website extraction error");
    return NextResponse.json({ error: "Failed to extract website data." }, { status: 500 });
  }
}
