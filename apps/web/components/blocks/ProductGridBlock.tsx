"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductGridSection, Brand, ProductGridItem } from "@/lib/schema/page-schema";
import { formatCurrency, cn } from "@/lib/utils";

interface ProductGridBlockProps {
  section: ProductGridSection;
  brand: Brand;
  razorpayKeyId: string;
}

interface RazorpayCtor {
  new (opts: Record<string, unknown>): { open: () => void };
}

const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID === "rzp_test_placeholder" ||
  (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.startsWith("rzp_live") &&
    process.env.NEXT_PUBLIC_RAZORPAY_LIVE !== "true");

export function ProductGridBlock({ section, brand, razorpayKeyId }: ProductGridBlockProps) {
  const colClass = section.layout === "grid-2"
    ? "grid-cols-1 sm:grid-cols-2"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="py-14 bg-gray-50">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900">{section.headline}</h2>
          {section.subheadline && (
            <p className="text-gray-500 mt-2 max-w-xl mx-auto">{section.subheadline}</p>
          )}
        </div>
        <div className={cn("grid gap-6", colClass)}>
          {section.items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              brand={brand}
              razorpayKeyId={razorpayKeyId}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductCard({
  item,
  brand,
  razorpayKeyId,
}: {
  item: ProductGridItem;
  brand: Brand;
  razorpayKeyId: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState(false);

  const currency = item.currency ?? "INR";
  const formatted = item.price > 0
    ? item.maxPrice && item.maxPrice > item.price
      ? `${formatCurrency(item.price, currency)} – ${formatCurrency(item.maxPrice, currency)}`
      : formatCurrency(item.price, currency)
    : "Free";

  return (
    <>
      <div
        className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col"
      >
        {/* Product image */}
        <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-5xl"
              style={{ background: `${brand.primaryColor}12` }}
            >
              🛍️
            </div>
          )}
          {item.badge && (
            <span
              className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {item.badge}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="p-5 flex flex-col gap-3 flex-1">
          <div>
            <h3 className="font-bold text-gray-900 text-lg leading-snug">{item.name}</h3>
            {item.description && (
              <p className="text-gray-500 text-sm mt-1 leading-relaxed">{item.description}</p>
            )}
          </div>

          {item.bullets && item.bullets.length > 0 && (
            <ul className="space-y-1">
              {item.bullets.slice(0, 3).map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span
                    className="mt-0.5 w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${brand.primaryColor}20`, color: brand.primaryColor }}
                  >
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex items-center justify-between pt-2">
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: brand.primaryColor }}
              translate="no"
            >
              {formatted}
            </span>
            {success ? (
              <span className="text-sm font-semibold text-green-600">✓ Ordered!</span>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="px-5 py-2.5 rounded-full text-white text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: brand.primaryColor }}
              >
                {item.price > 0 ? "Buy Now" : "Get Free"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <CheckoutModal
          item={item}
          brand={brand}
          razorpayKeyId={razorpayKeyId}
          formatted={formatted}
          onSuccess={() => { setShowModal(false); setSuccess(true); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function CheckoutModal({
  item, brand, razorpayKeyId, formatted, onSuccess, onClose,
}: {
  item: ProductGridItem;
  brand: Brand;
  razorpayKeyId: string;
  formatted: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const firstFocusRef = useRef<HTMLInputElement>(null);

  // Trap focus and handle Escape key when modal is open
  useEffect(() => {
    firstFocusRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const isDemoKey =
    IS_DEMO_MODE ||
    razorpayKeyId === "rzp_test_placeholder" ||
    !razorpayKeyId;

  const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  async function handleBuy() {
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email."); return;
    }
    setError("");
    setLoading(true);

    if (!item.price || isDemoKey) {
      await new Promise((r) => setTimeout(r, 1000));
      setLoading(false);
      onSuccess();
      return;
    }

    try {
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: item.price, currency: item.currency ?? "INR", receipt: `rcpt_${item.id}_${Date.now()}` }),
      });
      if (!orderRes.ok) {
        const { error: e } = await orderRes.json() as { error?: string };
        throw new Error(e || "Order creation failed");
      }
      const { orderId } = await orderRes.json() as { orderId: string };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!w.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          const timer = setTimeout(() => reject(new Error("Payment SDK took too long to load. Check your connection and try again.")), 10_000);
          s.onload = () => { clearTimeout(timer); resolve(); };
          s.onerror = () => { clearTimeout(timer); reject(new Error("Could not load payment SDK. Please check your internet connection.")); };
          document.head.appendChild(s);
        });
      }

      new (w.Razorpay as RazorpayCtor)({
        key: razorpayKeyId,
        order_id: orderId,
        amount: item.price,
        currency: item.currency ?? "INR",
        name: brand.name,
        description: item.name,
        image: brand.logo,
        prefill: { name, email, contact: phone },
        theme: { color: brand.primaryColor },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            if (!verifyRes.ok) throw new Error("Verification failed");
            setLoading(false);
            onSuccess();
          } catch {
            setLoading(false);
            setError("Payment could not be verified. Please contact support.");
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      }).open();
    } catch (err) {
      console.error("Payment error:", err);
      setError(err instanceof Error ? err.message : "Payment failed. Try again.");
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Checkout for ${item.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-5 text-white"
          style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor || "#0f172a"})` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Order</p>
              <h3 className="font-bold text-lg mt-0.5 leading-snug">{item.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="ml-3 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="text-3xl font-extrabold mt-3 tabular-nums" translate="no">{formatted}</p>
        </div>

        {/* Form */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {isDemoKey && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              🧪 Demo mode — no real charge
            </p>
          )}
          <ModalField label="Full Name *" type="text" value={name} onChange={setName} placeholder="Priya Sharma" brand={brand} inputRef={firstFocusRef} />
          <ModalField label="Email *" type="email" value={email} onChange={setEmail} placeholder="priya@example.com" brand={brand} />
          <ModalField label="Phone" type="tel" value={phone} onChange={setPhone} placeholder="+91 98765 43210" brand={brand} />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5" role="alert">
              ⚠ {error}
            </p>
          )}

          <button
            onClick={handleBuy}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base mt-1 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing…
              </span>
            ) : item.price > 0 ? `Pay ${formatted}` : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label, type, value, onChange, placeholder, brand, inputRef,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; brand: Brand;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        {label}
      </label>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none transition-colors"
        onFocus={(e) => { e.target.style.borderColor = brand.primaryColor; }}
        onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; }}
      />
    </div>
  );
}
