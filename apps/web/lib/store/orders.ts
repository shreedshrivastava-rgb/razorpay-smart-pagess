import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import { unstable_noStore as noStore } from "next/cache";
import { logger } from "@/lib/logger";

export type OrderStatus = "paid" | "refunded" | "partially_refunded" | "free";

// A verified, captured payment for one of the owner's pages.
export interface Order {
  id: string;            // razorpay payment id (unique)
  orderId: string;
  paymentId: string;
  slug: string;
  brandName: string;
  productName: string;
  amount: number;        // paise
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  ownerId: string;       // seller (page owner) email
  createdAt: string;
  // Refund tracking (set by /api/razorpay/refund)
  status?: OrderStatus;
  refundId?: string;
  refundAmount?: number; // paise refunded so far
  refundedAt?: string;
}

// Effective status when not explicitly stored (older orders / free claims).
export function orderStatus(o: Order): OrderStatus {
  if (o.status) return o.status;
  if (!o.paymentId) return "free";
  return "paid";
}

function blobAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

// ─── Vercel Blob ────────────────────────────────────────────────────────
async function blobSave(order: Order): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(`orders/${order.id}.json`, JSON.stringify(order), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function blobGetAll(ownerId: string): Promise<Order[]> {
  const { list, get } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: "orders/" });
  const orders = await Promise.all(
    blobs.map(async (b) => {
      try {
        const res = await get(b.pathname, { access: "private" });
        if (!res?.stream) return null;
        const text = await new Response(res.stream).text();
        const order = JSON.parse(text) as Order;
        return order.ownerId === ownerId ? order : null;
      } catch {
        return null;
      }
    })
  );
  return (orders.filter(Boolean) as Order[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ─── File fallback (local dev) ──────────────────────────────────────────
const DATA_DIR = process.env.VERCEL ? "/tmp/.smart-pages-data" : path.join(process.cwd(), ".data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

async function readFileOrders(): Promise<Record<string, Order>> {
  try {
    return JSON.parse(await readFile(ORDERS_FILE, "utf-8")) as Record<string, Order>;
  } catch {
    return {};
  }
}

async function writeFileOrders(orders: Record<string, Order>): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
  } catch { /* non-fatal */ }
}

// ─── Public API ─────────────────────────────────────────────────────────
export async function saveOrder(order: Order): Promise<void> {
  logger.info({ id: order.id, slug: order.slug, owner: order.ownerId, amount: order.amount }, "saveOrder");
  if (blobAvailable()) {
    await blobSave(order);
    return;
  }
  const orders = await readFileOrders();
  orders[order.id] = order;
  await writeFileOrders(orders);
}

export async function getOrders(ownerId: string): Promise<Order[]> {
  noStore();
  if (blobAvailable()) return blobGetAll(ownerId);
  const orders = await readFileOrders();
  return Object.values(orders)
    .filter((o) => o.ownerId === ownerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getOrderById(id: string): Promise<Order | null> {
  noStore();
  if (blobAvailable()) {
    const { get } = await import("@vercel/blob");
    const res = await get(`orders/${id}.json`, { access: "private", useCache: false });
    if (!res?.stream) return null;
    return JSON.parse(await new Response(res.stream).text()) as Order;
  }
  return (await readFileOrders())[id] ?? null;
}

// Merge a partial update onto an order (used by refunds). Returns the updated order.
export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
  const existing = await getOrderById(id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await saveOrder(updated);
  return updated;
}
