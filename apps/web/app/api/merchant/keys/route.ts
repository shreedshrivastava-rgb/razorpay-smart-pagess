import { NextRequest, NextResponse } from "next/server";
import { ownerId } from "@/auth";
import { saveMerchantKeys } from "@/lib/store/merchants";
import { isEncryptionConfigured } from "@/lib/crypto";

function checkCsrf(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  try { return new URL(source).host === host; } catch { return false; }
}

// Save a merchant's own Razorpay API keys (BYO). Owner-only.
export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEncryptionConfigured()) {
    return NextResponse.json({ error: "Server not configured to store credentials securely." }, { status: 503 });
  }

  const body = await req.json().catch(() => null) as { keyId?: string; keySecret?: string; mode?: string } | null;
  const keyId = body?.keyId?.trim();
  const keySecret = body?.keySecret?.trim();
  if (!keyId || !keySecret) {
    return NextResponse.json({ error: "Key ID and Key Secret are required." }, { status: 400 });
  }
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    return NextResponse.json({ error: "That doesn't look like a Razorpay Key ID (rzp_test_… or rzp_live_…)." }, { status: 400 });
  }
  const mode: "test" | "live" = keyId.startsWith("rzp_live_") ? "live" : "test";

  await saveMerchantKeys(owner, { keyId, keySecret, mode });
  return NextResponse.json({ success: true, mode });
}
