import { logger } from "@/lib/logger";
import { formatCurrency } from "@/lib/utils";

// Transactional email via Resend's REST API (no SDK dependency — plain fetch).
// Gracefully no-ops when RESEND_API_KEY / EMAIL_FROM aren't set, so the payment
// flow never breaks; it just doesn't send until configured.
//
// Setup: set RESEND_API_KEY and EMAIL_FROM (e.g. "Acme <orders@yourdomain.com>")
// with a domain verified in Resend.

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, html, replyTo }: SendArgs): Promise<boolean> {
  if (!emailConfigured()) {
    logger.info({ to, subject }, "email skipped (RESEND_API_KEY/EMAIL_FROM not set)");
    return false;
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, to }, "resend send failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "sendEmail error");
    return false;
  }
}

// ─── Templates ──────────────────────────────────────────────────────────────

function shell(brandName: string, primary: string, bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f8fb;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eaeef3">
      <div style="background:${primary};padding:20px 24px;color:#fff;font-size:18px;font-weight:700">${escapeHtml(brandName)}</div>
      <div style="padding:24px;color:#1f2937;font-size:14px;line-height:1.6">${bodyHtml}</div>
      <div style="padding:16px 24px;color:#9aa4b2;font-size:12px;border-top:1px solid #eef2f6">Powered by Razorpay Smart Pages</div>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

interface OrderEmailData {
  brandName: string;
  primaryColor?: string;
  productName: string;
  amount: number;     // paise
  currency: string;
  paymentId: string;
  customerName?: string;
  customerEmail?: string;
}

// Receipt to the buyer.
export function buyerReceiptEmail(o: OrderEmailData): { subject: string; html: string } {
  const primary = o.primaryColor || "#3395ff";
  const amount = o.amount > 0 ? formatCurrency(o.amount, o.currency) : "Free";
  const body = `
    <p>Hi ${escapeHtml(o.customerName?.split(" ")[0] || "there")},</p>
    <p>Thanks for your order from <strong>${escapeHtml(o.brandName)}</strong>. Here's your receipt:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;color:#6b7280">${escapeHtml(o.productName || "Order")}</td><td style="padding:8px 0;text-align:right;font-weight:700">${amount}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #eef2f6">Payment ID</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eef2f6;font-family:monospace;font-size:12px">${escapeHtml(o.paymentId)}</td></tr>
    </table>
    <p style="color:#6b7280">Keep this email as proof of payment. Reply here if you need help.</p>`;
  return { subject: `Your receipt from ${o.brandName}`, html: shell(o.brandName, primary, body) };
}

// Sale alert to the merchant.
export function merchantSaleEmail(o: OrderEmailData): { subject: string; html: string } {
  const primary = o.primaryColor || "#3395ff";
  const amount = o.amount > 0 ? formatCurrency(o.amount, o.currency) : "Free";
  const body = `
    <p><strong>You made a sale! 🎉</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 0;color:#6b7280">Product</td><td style="padding:8px 0;text-align:right;font-weight:600">${escapeHtml(o.productName || "—")}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Amount</td><td style="padding:8px 0;text-align:right;font-weight:700">${amount}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Customer</td><td style="padding:8px 0;text-align:right">${escapeHtml(o.customerName || o.customerEmail || "—")}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Payment ID</td><td style="padding:8px 0;text-align:right;font-family:monospace;font-size:12px">${escapeHtml(o.paymentId)}</td></tr>
    </table>`;
  return { subject: `New order: ${amount} — ${o.productName || o.brandName}`, html: shell(o.brandName, primary, body) };
}

// Refund notice to the buyer.
export function refundEmail(o: OrderEmailData & { refundAmount: number }): { subject: string; html: string } {
  const primary = o.primaryColor || "#3395ff";
  const body = `
    <p>Hi ${escapeHtml(o.customerName?.split(" ")[0] || "there")},</p>
    <p>A refund of <strong>${formatCurrency(o.refundAmount, o.currency)}</strong> has been issued for your order from ${escapeHtml(o.brandName)}.</p>
    <p style="color:#6b7280">It typically reaches your account in 5–7 business days. Payment ID: <span style="font-family:monospace">${escapeHtml(o.paymentId)}</span>.</p>`;
  return { subject: `Refund issued by ${o.brandName}`, html: shell(o.brandName, primary, body) };
}
