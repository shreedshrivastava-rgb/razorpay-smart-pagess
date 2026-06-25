import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { resolveMerchantAuth } from "@/lib/store/merchants";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit("order", ip, 20, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  let body: { amount: number; currency?: string; receipt?: string; slug?: string; isCart?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { amount, currency = "INR", receipt, slug, isCart } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer (paise)" }, { status: 400 });
  }

  // Route the order to the page owner's own Razorpay account when they've
  // connected one; otherwise fall back to the platform's env keys.
  let authHeader: string;
  let checkoutKeyId: string;
  const merchant = slug ? await resolveMerchantAuth((await getPageOwnerId(slug)) ?? "") : null;
  if (merchant) {
    authHeader = merchant.authHeader;
    checkoutKeyId = merchant.keyId;
  } else {
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "Razorpay keys not configured" }, { status: 503 });
    }
    authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
    checkoutKeyId = keyId;
  }

  if (slug && !isCart) {
    try {
      const page = await getPage(slug);
      if (page && page.payment.amount > 0) {
        if (amount > page.payment.amount) {
          return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
        }
        if (amount <= 0) {
          return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
        }
      }
    } catch { /* non-fatal */ }
  }

  const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ amount, currency, receipt }),
  });

  if (!rzpRes.ok) {
    const rawErr = await rzpRes.text();
    logger.error({ status: rzpRes.status, body: rawErr.slice(0, 300) }, "razorpay order error");
    let userMessage = "Order creation failed. Please try again.";
    try {
      const parsed = JSON.parse(rawErr) as { error?: { description?: string } };
      if (parsed.error?.description) userMessage = parsed.error.description;
    } catch { /* raw text */ }
    return NextResponse.json({ error: userMessage }, { status: rzpRes.status });
  }

  const order = await rzpRes.json();
  // keyId tells the client which account's checkout to open (merchant's or platform's).
  return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: checkoutKeyId });
}
