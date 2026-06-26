import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageOwnerId } from "@/lib/store/pages";
import { saveOrder } from "@/lib/store/orders";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { checkCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

// Confirms a "free" claim server-side — a buyer can't force the free path on a
// paid page from the client. The server checks the stored price is actually 0,
// then records the (free) order. Returns { ok } only when genuinely free.
export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit("order", ip, 20, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: getRateLimitHeaders(rateLimitResult) });
  }

  const body = (await req.json().catch(() => null)) as {
    slug?: string; isCart?: boolean; items?: Array<{ id: string; quantity: number }>;
    customerName?: string; customerEmail?: string; customerPhone?: string;
  } | null;
  const slug = body?.slug;
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const page = await getPage(slug);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Recompute the real price server-side; reject if anything actually costs money.
  let amount: number;
  if (body?.isCart) {
    const grid = page.sections.find((s) => s.type === "product-grid");
    const priceById = new Map(
      (grid && grid.type === "product-grid" ? grid.items : []).map((it) => [it.id, it.price] as const)
    );
    amount = (body.items ?? []).reduce((sum, li) => {
      const p = priceById.get(li.id);
      const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
      return p != null ? sum + p * qty : sum;
    }, 0);
  } else {
    amount = page.payment.amount;
  }

  if (amount > 0) {
    return NextResponse.json({ error: "This page is not free." }, { status: 400 });
  }

  // Record the free claim (best-effort), attributed to the owner.
  try {
    const ownerId = await getPageOwnerId(slug);
    if (ownerId) {
      await saveOrder({
        id: `free_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        orderId: "", paymentId: "",
        slug,
        brandName: page.brand?.name ?? slug,
        productName: page.payment?.name ?? "",
        amount: 0,
        currency: page.payment?.currency ?? "INR",
        customerName: body?.customerName ?? "",
        customerEmail: body?.customerEmail ?? "",
        customerPhone: body?.customerPhone,
        ownerId,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err }, "free claim save failed");
  }

  return NextResponse.json({ ok: true });
}
