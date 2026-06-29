import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { saveOrder, getOrderById, updateOrder, type OrderStatus } from "@/lib/store/orders";
import { logger } from "@/lib/logger";

// Razorpay webhook — the reliable, server-to-server record of truth for orders.
// The browser /verify call is best-effort (a buyer can close the tab right after
// paying); this endpoint guarantees the order is still recorded. Idempotent: it
// never clobbers a richer record already saved by /verify.
//
// Configure in Razorpay Dashboard → Settings → Webhooks: point at
// /api/razorpay/webhook, subscribe to payment.captured + refund.processed, and
// set the secret to RAZORPAY_WEBHOOK_SECRET. (Platform account; merchant-account
// webhooks need their own secret — future.)

function signatureValid(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface RzpPayment {
  id: string; order_id: string; amount: number; currency: string;
  email?: string; contact?: string; notes?: Record<string, string>;
}
interface RzpRefund {
  id: string; payment_id: string; amount: number; status?: string;
}

// Read the order's notes.slug — prefer the payload's order entity, else fetch it
// from Razorpay with the platform credentials (platform-account orders).
async function resolveSlug(payment: RzpPayment, orderEntity?: { notes?: Record<string, string> }): Promise<string | null> {
  if (orderEntity?.notes?.slug) return orderEntity.notes.slug;
  if (payment.notes?.slug) return payment.notes.slug;
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret || !payment.order_id) return null;
  try {
    const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
    const res = await fetch(`https://api.razorpay.com/v1/orders/${payment.order_id}`, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const o = await res.json() as { notes?: Record<string, string> };
    return o.notes?.slug ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("razorpay webhook hit but RAZORPAY_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhooks not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !signatureValid(rawBody, signature, secret)) {
    logger.warn("razorpay webhook signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event?: string; payload?: Record<string, { entity?: unknown }> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity as RzpPayment | undefined;
      if (payment?.id) await recordPayment(payment, event.payload?.order?.entity as { notes?: Record<string, string> } | undefined);
    } else if (event.event === "refund.processed" || event.event === "refund.created") {
      const refund = event.payload?.refund?.entity as RzpRefund | undefined;
      if (refund?.payment_id) await recordRefund(refund);
    }
  } catch (err) {
    // Always 200 so Razorpay doesn't hammer retries on a transient store error;
    // the failure is logged for manual follow-up.
    logger.error({ err, event: event.event }, "razorpay webhook handler error");
  }

  return NextResponse.json({ ok: true });
}

async function recordPayment(payment: RzpPayment, orderEntity?: { notes?: Record<string, string> }): Promise<void> {
  // Idempotent: /verify may already have saved a richer record (with the buyer's
  // typed name + address). Don't overwrite it.
  const existing = await getOrderById(payment.id);
  if (existing) return;

  const slug = await resolveSlug(payment, orderEntity);
  if (!slug) { logger.warn({ paymentId: payment.id }, "webhook: could not resolve slug"); return; }

  const [page, ownerId] = await Promise.all([getPage(slug), getPageOwnerId(slug)]);
  if (!page || !ownerId) { logger.warn({ slug }, "webhook: page/owner not found"); return; }

  await saveOrder({
    id: payment.id,
    orderId: payment.order_id,
    paymentId: payment.id,
    slug,
    brandName: page.brand?.name ?? slug,
    productName: page.payment?.name ?? "",
    amount: payment.amount,
    currency: payment.currency ?? "INR",
    customerName: "",
    customerEmail: payment.email ?? "",
    customerPhone: payment.contact,
    ownerId,
    createdAt: new Date().toISOString(),
    status: "paid",
  });
  logger.info({ paymentId: payment.id, slug }, "webhook recorded order");
}

async function recordRefund(refund: RzpRefund): Promise<void> {
  const order = await getOrderById(refund.payment_id);
  if (!order) return; // payment not recorded yet; nothing to update
  const alreadyRefunded = order.refundAmount ?? 0;
  // Razorpay refund amounts are cumulative per refund; if this refund is already
  // reflected (same id), skip.
  if (order.refundId === refund.id) return;
  const newRefunded = Math.min(order.amount, alreadyRefunded + refund.amount);
  const status: OrderStatus = newRefunded >= order.amount ? "refunded" : "partially_refunded";
  await updateOrder(order.id, {
    refundId: refund.id,
    refundAmount: newRefunded,
    refundedAt: new Date().toISOString(),
    status,
  });
  logger.info({ paymentId: refund.payment_id, refundId: refund.id }, "webhook recorded refund");
}
