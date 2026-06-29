import Link from "next/link";
import { getOrders, orderStatus } from "@/lib/store/orders";
import { ownerId } from "@/auth";
import { formatCurrency } from "@/lib/utils";
import OrdersTable from "./OrdersTable";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const owner = await ownerId();
  const orders = owner ? await getOrders(owner) : [];
  const currency = orders[0]?.currency || "INR";

  // Net revenue = collected − refunded (free claims contribute 0).
  const grossPaise = orders.reduce((sum, o) => sum + (o.amount || 0), 0);
  const refundedPaise = orders.reduce((sum, o) => sum + (o.refundAmount || 0), 0);
  const netPaise = grossPaise - refundedPaise;
  const uniqueCustomers = new Set(
    orders.map((o) => (o.customerEmail || "").trim().toLowerCase()).filter(Boolean)
  ).size;

  const rows = orders.map((o) => ({ ...o, _status: orderStatus(o) }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-6xl h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">Smart Pages</span>
            <span className="text-gray-300 mx-1">by</span>
            <span className="font-semibold text-blue-600">Razorpay</span>
          </div>
          <Link href="/dashboard" className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">
            ← My Pages
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-6xl py-10">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order records</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Orders, customers, revenue and refunds across all your pages.
            </p>
          </div>
          {orders.length > 0 && (
            <a
              href="/api/orders/export"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 3v13m0 0l-4-4m4 4l4-4" />
              </svg>
              Export CSV
            </a>
          )}
        </div>

        {orders.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Net revenue" value={formatCurrency(netPaise, currency)} hint={refundedPaise > 0 ? `${formatCurrency(refundedPaise, currency)} refunded` : "after refunds"} />
            <StatCard label="Collected" value={formatCurrency(grossPaise, currency)} hint="gross" />
            <StatCard label="Orders" value={String(orders.length)} hint={`${orders.filter((o) => orderStatus(o) === "paid").length} paid`} />
            <StatCard label="Customers" value={String(uniqueCustomers)} hint="unique buyers" />
          </div>
        )}

        {orders.length === 0 ? <EmptyState /> : <OrdersTable orders={rows} />}
      </main>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-3xl bg-indigo-50 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h3>
      <p className="text-gray-500 text-sm mb-8 max-w-xs">
        When customers pay on your published pages, their orders show up here.
      </p>
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
      >
        View my pages
      </Link>
    </div>
  );
}
