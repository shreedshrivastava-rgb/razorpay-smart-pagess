import { NextRequest, NextResponse } from "next/server";
import { ownerId } from "@/auth";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { getOrderById, updateOrder, type OrderStatus } from "@/lib/store/orders";
import { sendEmail, refundEmail } from "@/lib/email";
import { resolveMerchantAuth } from "@/lib/store/merchants";
import { logger } from "@/lib/logger";

// Merchant-initiated refund (full or partial), wired to the Razorpay Refunds API.
// Owner-only; uses the page owner's merchant credentials (or platform fallback).
export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("refund", ip, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: getRateLimitHeaders(rl) });

  const body = (await req.json().catch(() => null)) as { id?: string; amount?: number } | null;
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "Order id is required" }, { status: 400 });

  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.ownerId !== owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!order.paymentId) return NextResponse.json({ error: "This order can't be refunded (no payment)." }, { status: 400 });

  const alreadyRefunded = order.refundAmount ?? 0;
  const refundable = order.amount - alreadyRefunded;
  if (refundable <= 0) return NextResponse.json({ error: "Order is already fully refunded." }, { status: 400 });

  // Partial amount (paise) if provided and valid; otherwise refund the remainder.
  const reqAmount = typeof body?.amount === "number" && body.amount > 0 ? Math.round(body.amount) : refundable;
  if (reqAmount > refundable) return NextResponse.json({ error: "Refund exceeds the refundable amount." }, { status: 400 });

  const auth = await resolveMerchantAuth(owner);
  const authHeader = auth?.authHeader
    ?? (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
      ? `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`
      : null);
  if (!authHeader) return NextResponse.json({ error: "Payments not configured." }, { status: 503 });

  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${order.paymentId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ amount: reqAmount }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: { description?: string } })?.error?.description || "Refund failed.";
      logger.error({ id, status: res.status, msg }, "razorpay refund error");
      return NextResponse.json({ error: msg }, { status: res.status });
    }
    const refund = data as { id: string; amount: number };
    const newRefunded = alreadyRefunded + reqAmount;
    const status: OrderStatus = newRefunded >= order.amount ? "refunded" : "partially_refunded";
    const updated = await updateOrder(id, {
      refundId: refund.id,
      refundAmount: newRefunded,
      refundedAt: new Date().toISOString(),
      status,
    });

    // Notify the buyer immediately (the webhook's refund handler early-returns on
    // this same refundId, so there's no duplicate email).
    if (order.customerEmail) {
      const e = refundEmail({
        brandName: order.brandName,
        productName: order.productName,
        amount: order.amount,
        currency: order.currency,
        paymentId: order.paymentId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        refundAmount: reqAmount,
      });
      void sendEmail({ to: order.customerEmail, subject: e.subject, html: e.html, replyTo: order.ownerId });
    }

    return NextResponse.json({ success: true, refundId: refund.id, refundAmount: newRefunded, status, order: updated });
  } catch (err) {
    logger.error({ err }, "refund request failed");
    return NextResponse.json({ error: "Refund request failed. Try again." }, { status: 500 });
  }
}
