import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ownerId } from "@/auth";
import { checkCsrf } from "@/lib/csrf";
import { persistImageBytes, decodeDataUrl } from "@/lib/image-store";

// Stores an uploaded image (sent as a base64 data URL) on the fast origin and
// returns its URL, so the page stores a short URL instead of a multi-MB blob.
// Owner-only + CSRF — only signed-in creators upload while editing.
export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
  const dataUrl = body?.dataUrl;
  if (!dataUrl) return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });

  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
  if (decoded.bytes.byteLength > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 8 MB)." }, { status: 413 });
  }

  const url = await persistImageBytes(decoded.bytes, `upload-${randomBytes(8).toString("hex")}`, decoded.contentType);
  if (!url) return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  return NextResponse.json({ url });
}
