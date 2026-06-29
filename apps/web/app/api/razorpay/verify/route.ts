import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { resolveMerchantAuth } from "@/lib/store/merchants";
import { saveOrder, getOrderById } from "@/lib/store/orders";
import { sendEmail, buyerReceiptEmail, merchantSaleEmail } from "@/lib/email";
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
    // Require a CAPTURED payment — "authorized" means funds are only held and
    // will lapse if not captured, so it must not count as paid.
    return p.status === "captured" && p.order_id === orderId;
  } catch {
    return false;
  }
}

// Authoritative paise amount of an order, read back from Razorpay.
async function fetchOrderAmount(orderId: string, authHeader: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return null;
    const o = await res.json() as { amount?: number };
    return typeof o.amount === "number" ? o.amount : null;
  } catch {
    return null;
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
  // Only record for a page that actually exists (avoids misattributing junk
  // slugs to the primary owner), and use the authoritative amount from Razorpay
  // rather than the client-supplied value.
  let recordedAmount = body.amount ?? 0;
  try {
    if (body.slug) {
      const [page, ownerId] = await Promise.all([getPage(body.slug), getPageOwnerId(body.slug)]);
      if (page && ownerId) {
        const orderAuth = merchant?.authHeader
          ?? (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
            ? `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`
            : null);
        const amount = (orderAuth ? await fetchOrderAmount(orderId, orderAuth) : null) ?? body.amount ?? 0;
        recordedAmount = amount;
        const isNewOrder = !(await getOrderById(paymentId));
        await saveOrder({
          id: paymentId,
          orderId,
          paymentId,
          slug: body.slug,
          brandName: page.brand?.name ?? body.slug,
          productName: page.payment?.name ?? "",
          amount,
          currency: body.currency ?? "INR",
          customerName: body.customerName ?? "",
          customerEmail: body.customerEmail ?? "",
          customerPhone: body.customerPhone,
          ownerId,
          createdAt: new Date().toISOString(),
        });

        // Notify only on first record so the webhook + verify don't double-send.
        if (isNewOrder) {
          const emailData = {
            brandName: page.brand?.name ?? body.slug,
            primaryColor: page.brand?.primaryColor,
            productName: page.payment?.name ?? "",
            amount,
            currency: body.currency ?? "INR",
            paymentId,
            customerName: body.customerName,
            customerEmail: body.customerEmail,
          };
          if (body.customerEmail) {
            const r = buyerReceiptEmail(emailData);
            void sendEmail({ to: body.customerEmail, subject: r.subject, html: r.html, replyTo: ownerId });
          }
          const m = merchantSaleEmail(emailData);
          void sendEmail({ to: ownerId, subject: m.subject, html: m.html, replyTo: body.customerEmail });
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "order save failed");
  }

  return NextResponse.json({
    verified: true,
    order: { orderId, paymentId, amount: recordedAmount, currency: body.currency ?? "INR" },
  });
}
