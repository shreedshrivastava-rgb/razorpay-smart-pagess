import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { resolveMerchantAuth } from "@/lib/store/merchants";
import { saveOrder } from "@/lib/store/orders";
import { logger } from "@/lib/logger";

// HMAC check against a specific key secret (BYO / platform).
function signatureMatches(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// OAuth merchants don't expose their key secret to the platform — confirm the
// payment by reading it back from Razorpay with the merchant's access token.
async function paymentIsCaptured(orderId: string, paymentId: string, authHeader: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return false;
    const p = await res.json() as { status?: string; order_id?: string };
    return (p.status === "captured" || p.status === "authorized") && p.order_id === orderId;
  } catch {
    return false;
  }
}

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

  // Verify against the same account that created the order: the page owner's
  // connected merchant (BYO secret → HMAC; OAuth → payments API), else platform env.
  const merchant = body.slug ? await resolveMerchantAuth((await getPageOwnerId(body.slug)) ?? "") : null;

  let verified = false;
  if (merchant?.method === "keys" && merchant.keySecret) {
    verified = signatureMatches(orderId, paymentId, signature, merchant.keySecret);
  } else if (merchant?.method === "oauth") {
    verified = await paymentIsCaptured(orderId, paymentId, merchant.authHeader);
  } else {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
    verified = signatureMatches(orderId, paymentId, signature, secret);
  }

  if (!verified) {
    logger.warn({ orderId, paymentId }, "razorpay payment verification failed");
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
    logger.error({ err }, "order save failed");
  }

  return NextResponse.json({ verified: true });
}
