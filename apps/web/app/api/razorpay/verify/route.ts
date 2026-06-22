import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit("verify", ip, 30, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
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
