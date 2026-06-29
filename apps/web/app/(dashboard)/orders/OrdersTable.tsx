"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/store/orders";

type Row = Order & { _status: OrderStatus };

const STATUS_STYLE: Record<OrderStatus, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  refunded: { label: "Refunded", cls: "bg-gray-100 text-gray-600 ring-gray-500/20" },
  partially_refunded: { label: "Part. refunded", cls: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  free: { label: "Free", cls: "bg-blue-50 text-blue-700 ring-blue-600/20" },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function OrdersTable({ orders }: { orders: Row[] }) {
  const router = useRouter();
  const [active, setActive] = useState<Row | null>(null);

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Page</th>
                <th className="px-5 py-3 font-semibold text-right">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Payment ID</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const refunded = o.refundAmount ?? 0;
                const canRefund = o._status !== "free" && o._status !== "refunded" && !!o.paymentId;
                return (
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
                      {refunded > 0 && (
                        <div className="text-xs font-normal text-gray-400">−{formatCurrency(refunded, o.currency)} refunded</div>
                      )}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={o._status} /></td>
                    <td className="px-5 py-3 text-xs text-gray-400 font-mono">{o.paymentId || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {canRefund ? (
                        <button
                          onClick={() => setActive(o)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                        >
                          Refund
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {active && (
        <RefundModal
          order={active}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function RefundModal({ order, onClose, onDone }: { order: Row; onClose: () => void; onDone: () => void }) {
  const refundable = order.amount - (order.refundAmount ?? 0);
  const [amountStr, setAmountStr] = useState((refundable / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const rupees = parseFloat(amountStr);
    if (!Number.isFinite(rupees) || rupees <= 0) { setError("Enter a valid amount."); return; }
    const paise = Math.round(rupees * 100);
    if (paise > refundable) { setError(`Max refundable is ${formatCurrency(refundable, order.currency)}.`); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/razorpay/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, amount: paise }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Refund failed."); setBusy(false); return; }
      onDone();
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">Issue refund</h3>
        <p className="text-sm text-gray-500 mt-1">
          {order.customerName || order.customerEmail} · {order.productName || order.slug}
        </p>
        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Order total</span><span className="font-medium text-gray-900">{formatCurrency(order.amount, order.currency)}</span></div>
          {(order.refundAmount ?? 0) > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">Already refunded</span><span className="font-medium text-gray-900">{formatCurrency(order.refundAmount ?? 0, order.currency)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-gray-500">Refundable</span><span className="font-semibold text-gray-900">{formatCurrency(refundable, order.currency)}</span></div>
        </div>

        <label className="block mt-4 text-sm font-medium text-gray-700">Refund amount ({order.currency})</label>
        <input
          type="number" step="0.01" min="0" value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          disabled={busy}
          className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
        />

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-6 flex gap-3 justify-end">
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60">
            {busy ? "Processing…" : "Refund"}
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">Refunds are processed via Razorpay and can take 5–7 business days to reach the customer.</p>
      </div>
    </div>
  );
}
