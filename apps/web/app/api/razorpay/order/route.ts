import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return NextResponse.json({ error: "Razorpay keys not configured" }, { status: 503 });
  }

  let body: { amount: number; currency?: string; receipt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { amount, currency = "INR", receipt } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer (paise)" }, { status: 400 });
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
    const err = await rzpRes.text();
    return NextResponse.json({ error: err }, { status: rzpRes.status });
  }

  const order = await rzpRes.json();
  // Return only what the client needs — never expose key_secret
  return NextResponse.json({ orderId: order.id, amount: order.amount, currency: order.currency });
}
