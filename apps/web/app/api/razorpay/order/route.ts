import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { variantChoice } from "@/lib/schema/page-schema";
import { resolveMerchantAuth } from "@/lib/store/merchants";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit("order", ip, 20, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  let body: {
    currency?: string; receipt?: string; slug?: string; isCart?: boolean;
    couponCode?: string; items?: Array<{ id: string; quantity: number }>;
    variants?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { currency = "INR", receipt, slug, isCart, couponCode, items, variants } = body;
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  // The amount is computed SERVER-SIDE from the stored page — never trusted from
  // the client — so a buyer can't create a cheap order and pay less.
  const page = await getPage(slug);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  let amount: number;
  if (isCart) {
    const grid = page.sections.find((s) => s.type === "product-grid");
    const priceById = new Map(
      (grid && grid.type === "product-grid" ? grid.items : []).map((it) => [it.id, it.price] as const)
    );
    amount = (items ?? []).reduce((sum, li) => {
      const p = priceById.get(li.id);
      const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
      return p != null ? sum + p * qty : sum;
    }, 0);
  } else {
    amount = page.payment.amount;
    // Add price deltas for the selected variants (e.g. a larger size).
    for (const v of page.variants ?? []) {
      const chosen = variants?.[v.label];
      if (!chosen) continue;
      const opt = v.options.map(variantChoice).find((o) => o.label === chosen);
      if (opt) amount += opt.priceDelta;
    }
    const cc = page.payment.couponConfig;
    if (cc && couponCode && couponCode.trim().toUpperCase() === cc.code.toUpperCase()) {
      amount -= Math.round((amount * cc.discountPercent) / 100);
    }
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
  }

  // Route the order to the page owner's own Razorpay account when they've
  // connected one; otherwise fall back to the platform's env keys.
  let authHeader: string;
  let checkoutKeyId: string;
  const merchant = await resolveMerchantAuth((await getPageOwnerId(slug)) ?? "");
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
