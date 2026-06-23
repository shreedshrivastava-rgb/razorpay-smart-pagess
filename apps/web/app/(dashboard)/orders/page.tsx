import Link from "next/link";
import { getOrders } from "@/lib/store/orders";
import { ownerId } from "@/auth";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const owner = await ownerId();
  const orders = owner ? await getOrders(owner) : [];
  const totalPaise = orders.reduce((sum, o) => sum + (o.amount || 0), 0);

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
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {orders.length} order{orders.length !== 1 ? "s" : ""}
              {orders.length > 0 && <> · {formatCurrency(totalPaise, orders[0].currency)} collected</>}
            </p>
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Page</th>
                    <th className="px-5 py-3 font-semibold text-right">Amount</th>
                    <th className="px-5 py-3 font-semibold">Payment ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{o.customerName || "—"}</div>
                        <div className="text-xs text-gray-400">{o.customerEmail}{o.customerPhone ? ` · ${o.customerPhone}` : ""}</div>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/p/${o.slug}`} target="_blank" className="text-indigo-600 hover:underline">
                          {o.brandName || o.slug}
                        </Link>
                        {o.productName && <div className="text-xs text-gray-400">{o.productName}</div>}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(o.amount, o.currency)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 font-mono">{o.paymentId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
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
