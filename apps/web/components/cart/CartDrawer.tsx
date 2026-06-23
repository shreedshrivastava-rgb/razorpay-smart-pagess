"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "./CartContext";
import type { CartItem } from "./CartContext";
import { formatCurrency } from "@/lib/utils";
import type { Brand } from "@/lib/schema/page-schema";

interface RazorpayCtor {
  new (opts: Record<string, unknown>): { open: () => void };
}

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function CartDrawer({ brand, razorpayKeyId, isDemo = false }: { brand: Brand; razorpayKeyId: string; isDemo?: boolean }) {
  const { items, remove, updateQty, clear, total, count, isOpen, close } = useCart();
  const [stage, setStage] = useState<"cart" | "checkout">("cart");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Focus first input when checkout opens
  useEffect(() => {
    if (stage === "checkout") setTimeout(() => firstRef.current?.focus(), 50);
  }, [stage]);

  if (success) {
    return isOpen ? (
      <Overlay onClose={close}>
        <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: `${brand.primaryColor}20` }}>✓</div>
          <h2 className="text-xl font-bold text-gray-900">Order placed!</h2>
          <p className="text-gray-500 text-sm">You'll receive a confirmation on {email}.</p>
          <button
            onClick={() => { close(); setSuccess(false); setStage("cart"); setName(""); setEmail(""); setPhone(""); }}
            className="px-6 py-2.5 rounded-full text-white text-sm font-bold"
            style={{ backgroundColor: brand.primaryColor }}
          >
            Done
          </button>
        </div>
      </Overlay>
    ) : null;
  }

  return isOpen ? (
    <Overlay onClose={close}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {stage === "checkout" && (
            <button onClick={() => setStage("cart")} className="text-gray-400 hover:text-gray-700 mr-1">←</button>
          )}
          <h2 className="font-bold text-gray-900">
            {stage === "cart" ? `Your Bag (${count})` : "Checkout"}
          </h2>
        </div>
        <button onClick={close} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 text-lg">×</button>
      </div>

      {stage === "cart" ? (
        <>
          {/* Items */}
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="text-5xl">🛍️</div>
              <p className="text-gray-500 text-sm">Your bag is empty</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <div className="w-16 h-16 rounded-xl bg-gray-50 shrink-0 overflow-hidden flex items-center justify-center">
                    {item.imageUrl
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      : <span className="text-2xl">🛍️</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: brand.primaryColor }} translate="no">
                      {formatCurrency(item.price, item.currency)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQty(item.id, item.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold hover:bg-gray-50"
                      >−</button>
                      <span className="text-sm font-semibold w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.id, item.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center text-sm font-bold hover:bg-gray-50"
                      >+</button>
                      <button onClick={() => remove(item.id)} className="ml-auto text-xs text-gray-400 hover:text-red-500">Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {items.length > 0 && (
            <div className="px-5 py-4 border-t border-gray-100">
              <div className="flex justify-between mb-4">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="font-extrabold text-gray-900 tabular-nums" translate="no">
                  {formatCurrency(total, items[0]?.currency ?? "INR")}
                </span>
              </div>
              <button
                onClick={() => setStage("checkout")}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: brand.primaryColor }}
              >
                Proceed to Checkout →
              </button>
            </div>
          )}
        </>
      ) : (
        /* Checkout form */
        <>
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
            {/* Order summary */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.name} × {item.quantity}</span>
                  <span className="font-semibold tabular-nums" translate="no">
                    {formatCurrency(item.price * item.quantity, item.currency)}
                  </span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-bold">
                <span>Total</span>
                <span translate="no">{formatCurrency(total, items[0]?.currency ?? "INR")}</span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <CheckoutField label="Full Name *" type="text" value={name} onChange={setName} placeholder="Priya Sharma" inputRef={firstRef} />
              <CheckoutField label="Email *" type="email" value={email} onChange={setEmail} placeholder="priya@example.com" />
              <CheckoutField label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="+91 98765 43210" />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">⚠ {error}</p>
            )}
          </div>

          <div className="px-5 py-4 border-t border-gray-100">
            <button
              onClick={() => handleCheckout({ name, email, phone, items, total, brand, razorpayKeyId, isDemo, setLoading, setError, onSuccess: () => { clear(); setSuccess(true); } })}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {loading ? "Processing…" : `Pay ${formatCurrency(total, items[0]?.currency ?? "INR")}`}
            </button>
          </div>
        </>
      )}
    </Overlay>
  ) : null;
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
        style={{ animation: "slideInRight 0.25s ease-out" }}
      >
        {children}
      </div>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}

function CheckoutField({
  label, type, value, onChange, placeholder, inputRef,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
      />
    </div>
  );
}

async function handleCheckout({
  name, email, phone, items, total, brand, razorpayKeyId, isDemo, setLoading, setError, onSuccess,
}: {
  name: string; email: string; phone: string;
  items: CartItem[]; total: number;
  brand: Brand; razorpayKeyId: string; isDemo: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
  onSuccess: () => void;
}) {
  if (!name.trim()) { setError("Please enter your name."); return; }
  if (!email.trim() || !EMAIL_RE.test(email.trim())) { setError("Please enter a valid email."); return; }
  setError("");
  setLoading(true);

  // isDemo carries the page-level guard (test mode, or a live key without the
  // explicit NEXT_PUBLIC_RAZORPAY_LIVE=true flag) — simulate instead of charging.
  const isDemoKey = isDemo || !razorpayKeyId || razorpayKeyId === "rzp_test_placeholder";

  if (isDemoKey || total === 0) {
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    onSuccess();
    return;
  }

  try {
    const orderRes = await fetch("/api/razorpay/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: total, currency: items[0]?.currency ?? "INR", isCart: true }),
    });
    if (!orderRes.ok) {
      const { error: e } = await orderRes.json() as { error?: string };
      throw new Error(e ?? "Order creation failed");
    }
    const { orderId } = await orderRes.json() as { orderId: string };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (!w.Razorpay) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://checkout.razorpay.com/v1/checkout.js";
        const t = setTimeout(() => reject(new Error("Payment SDK took too long")), 10_000);
        s.onload = () => { clearTimeout(t); resolve(); };
        s.onerror = () => { clearTimeout(t); reject(new Error("Could not load payment SDK")); };
        document.head.appendChild(s);
      });
    }

    interface RazorpayResponse { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
    new (w.Razorpay as RazorpayCtor)({
      key: razorpayKeyId,
      order_id: orderId,
      amount: total,
      currency: items[0]?.currency ?? "INR",
      name: brand.name,
      description: `${items.length} item${items.length > 1 ? "s" : ""}`,
      image: brand.logo,
      prefill: { name, email, contact: phone },
      theme: { color: brand.primaryColor },
      handler: async (response: RazorpayResponse) => {
        const verifyRes = await fetch("/api/razorpay/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          }),
        });
        if (!verifyRes.ok) { setLoading(false); setError("Payment verification failed. Contact support."); return; }
        setLoading(false);
        onSuccess();
      },
      modal: { ondismiss: () => setLoading(false) },
    }).open();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Payment failed. Try again.");
    setLoading(false);
  }
}
