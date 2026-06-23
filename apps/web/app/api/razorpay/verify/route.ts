import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { saveOrder } from "@/lib/store/orders";

interface VerifyBody {
  orderId?: string; paymentId?: string; signature?: string;
  slug?: string; amount?: number; currency?: string;
  customerName?: string; customerEmail?: string; customerPhone?: string;
}

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

  let body: VerifyBody;
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

  // Payment is genuine — record the order against the page owner (best-effort).
  try {
    if (body.slug && body.amount && body.amount > 0) {
      const [page, ownerId] = await Promise.all([getPage(body.slug), getPageOwnerId(body.slug)]);
      if (ownerId) {
        await saveOrder({
          id: paymentId,
          orderId,
          paymentId,
          slug: body.slug,
          brandName: page?.brand?.name ?? body.slug,
          productName: page?.payment?.name ?? "",
          amount: body.amount,
          currency: body.currency ?? "INR",
          customerName: body.customerName ?? "",
          customerEmail: body.customerEmail ?? "",
          customerPhone: body.customerPhone,
          ownerId,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("Order save failed:", err);
  }

  return NextResponse.json({ verified: true });
}
