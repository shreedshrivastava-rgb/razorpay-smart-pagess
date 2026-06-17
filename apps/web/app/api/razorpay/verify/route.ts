import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const verifyRateLimit = new Map<string, { count: number; resetAt: number }>();
function checkVerifyRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = verifyRateLimit.get(ip);
  if (!entry || now > entry.resetAt) { verifyRateLimit.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkVerifyRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: { orderId?: string; paymentId?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "orderId, paymentId, and signature are required" }, { status: 400 });
  }

  const expected = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expected !== signature) {
    console.warn("Razorpay signature mismatch", { orderId, paymentId });
    return NextResponse.json({ verified: false }, { status: 400 });
  }

  return NextResponse.json({ verified: true });
}
