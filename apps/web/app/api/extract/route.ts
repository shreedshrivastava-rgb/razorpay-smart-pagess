import { NextRequest, NextResponse } from "next/server";
import { isValidUrl } from "@/lib/utils";
import { extractBrand, extractProduct } from "@/lib/extract/jina";

function normalizeAndValidate(raw: string): { url: string } | { error: string; status: number } {
  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
  if (!isValidUrl(normalized)) return { error: "Invalid URL", status: 400 };
  const { hostname } = new URL(normalized);
  if (
    hostname === "localhost" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("127.")
  ) {
    return { error: "Private URLs not allowed", status: 400 };
  }
  return { url: normalized };
}

// GET /api/extract?url=... — used by Step3Details for product extraction
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  if (!raw) return NextResponse.json({ error: "url param required" }, { status: 400 });

  const result = normalizeAndValidate(raw);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    const product = await extractProduct(result.url);
    return NextResponse.json(product);
  } catch (err) {
    console.error("Product extraction error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

// POST /api/extract — used by Step1Import for brand/website extraction
export async function POST(req: NextRequest) {
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
    console.error("Extraction error:", error);
    return NextResponse.json({ error: "Failed to extract website data." }, { status: 500 });
  }
}
