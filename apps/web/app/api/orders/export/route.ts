import { NextResponse } from "next/server";
import { ownerId } from "@/auth";
import { getOrders, orderStatus } from "@/lib/store/orders";

// Owner-only CSV export of the seller's orders (Order records page → Export).
function csvCell(v: string | number | undefined): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await getOrders(owner);
  const header = [
    "Date", "Customer", "Email", "Phone", "Page", "Product",
    "Amount", "Currency", "Payment ID", "Order ID", "Status", "Refunded",
  ];
  const rows = orders.map((o) => [
    new Date(o.createdAt).toISOString(),
    o.customerName,
    o.customerEmail,
    o.customerPhone ?? "",
    o.slug,
    o.productName,
    (o.amount / 100).toFixed(2),
    o.currency,
    o.paymentId,
    o.orderId,
    orderStatus(o),
    o.refundAmount ? (o.refundAmount / 100).toFixed(2) : "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
