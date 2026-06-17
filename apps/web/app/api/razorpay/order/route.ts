import { NextRequest, NextResponse } from "next/server";
import { getPage } from "@/lib/store/pages";

const orderRateLimit = new Map<string, { count: number; resetAt: number }>();
function checkOrderRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = orderRateLimit.get(ip);
  if (!entry || now > entry.resetAt) { orderRateLimit.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkOrderRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return NextResponse.json({ error: "Razorpay keys not configured" }, { status: 503 });
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

  // Server-side amount guard: if a page slug is provided and this is NOT a cart order,
  // ensure the amount is not greater than the page's listed price.
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
    } catch { /* non-fatal — still allow order if page lookup fails */ }
  }

  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({ amount, currency, receipt }),
  });

  if (!rzpRes.ok) {
    const rawErr = await rzpRes.text();
    console.error("Razorpay order error:", rzpRes.status, rawErr.slice(0, 300));
    let userMessage = "Order creation failed. Please try again.";
    try {
      const parsed = JSON.parse(rawErr) as { error?: { description?: string } };
      if (parsed.error?.description) userMessage = parsed.error.description;
    } catch { /* raw text, not JSON */ }
    return NextResponse.json({ error: userMessage }, { status: rzpRes.status });
  }

  const order = await rzpRes.json();
  // Return only what the client needs — never expose key_secret
  return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency });
}
