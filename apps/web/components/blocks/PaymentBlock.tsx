"use client";

import { useState } from "react";
import type { Payment, Brand, VariantOption } from "@/lib/schema/page-schema";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface PaymentBlockProps {
  payment: Payment;
  brand: Brand;
  pageTitle: string;
  variants?: VariantOption[];
}

interface RazorpayOptions {
  key: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name?: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler?: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}

type RazorpayCtor = new (options: RazorpayOptions) => { open: () => void };

// Demo mode = no key, placeholder key, OR live key without explicit opt-in
const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID === "rzp_test_placeholder" ||
  (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.startsWith("rzp_live") &&
    process.env.NEXT_PUBLIC_RAZORPAY_LIVE !== "true");

export function PaymentBlock({ payment, brand, variants = [] }: PaymentBlockProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const isFree = !payment.amount || payment.amount <= 0;
  const isDemoKey =
    IS_DEMO_MODE ||
    payment.razorpayKeyId === "rzp_test_placeholder" ||
    !payment.razorpayKeyId;

  const discount = couponApplied && payment.couponConfig
    ? Math.round(payment.amount * payment.couponConfig.discountPercent / 100)
    : 0;
  const effectiveAmount = payment.amount - discount;

  const formattedAmount = isFree ? "Free" : formatCurrency(effectiveAmount, payment.currency);

  function applyForcedCoupon() {
    setCouponError("");
    if (!payment.couponConfig) return;
    if (couponCode.trim().toUpperCase() === payment.couponConfig.code.toUpperCase()) {
      setCouponApplied(true);
    } else {
      setCouponError("Invalid coupon code.");
    }
  }

  function validateInputs(): string | null {
    if (!name.trim()) return "Please enter your name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email.";
    if (phone && !/^\+?[\d\s\-()]{7,15}$/.test(phone)) return "Please enter a valid phone number.";
    if (variants) {
      for (const v of variants ?? []) {
        if (!selectedVariants[v.label]) return `Please select a ${v.label}.`;
      }
    }
    if (payment.customFields) {
      for (const f of payment.customFields ?? []) {
        if (f.required && !customFieldValues[f.label]?.trim()) {
          return `"${f.label}" is required.`;
        }
      }
    }
    return null;
  }

  async function handlePay() {
    setError(null);
    const validationError = validateInputs();
    if (validationError) { setError(validationError); return; }
    setLoading(true);

    if (isFree || isDemoKey) {
      await new Promise((r) => setTimeout(r, 1000));
      setLoading(false);
      setShowSuccess(true);
      return;
    }

    try {
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: effectiveAmount,
          currency: payment.currency,
          receipt: `rcpt_${Date.now()}`,
        }),
      });

      if (!orderRes.ok) {
        const { error: errMsg } = await orderRes.json() as { error?: string };
        throw new Error(errMsg || `Order creation failed (${orderRes.status})`);
      }

      const { orderId } = await orderRes.json() as { orderId: string };

      // Load Razorpay checkout.js if not already present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!w.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load payment SDK"));
          document.head.appendChild(s);
        });
      }

      const RazorpayCtor = w.Razorpay as RazorpayCtor;
      const rzp = new RazorpayCtor({
        key: payment.razorpayKeyId,
        order_id: orderId,
        amount: effectiveAmount,
        currency: payment.currency,
        name: brand.name,
        description: payment.name,
        image: brand.logo,
        prefill: { name, email, contact: phone },
        theme: { color: payment.theme?.color || brand.primaryColor },
        handler: async (response) => {
          // Server-side signature verification before showing success
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
            if (!verifyRes.ok) throw new Error("Signature verification failed");
            setLoading(false);
            setShowSuccess(true);
          } catch {
            setLoading(false);
            setError("Payment could not be verified. Please contact support.");
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (err) {
      console.error("Payment error:", err);
      setLoading(false);
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
    }
  }

  if (showSuccess) {
    return <SuccessState brand={brand} name={name} amount={formattedAmount} isFree={isFree} />;
  }

  return (
    <section className="py-16" id="pay">
      <div className="container mx-auto px-4 max-w-md">
        {isDemoKey && !isFree && <DemoBanner />}

        <div
          className="rounded-3xl overflow-hidden shadow-2xl border border-gray-100"
          style={{ boxShadow: `0 25px 60px -10px ${brand.primaryColor}30` }}
        >
          {/* Card header */}
          <div
            className="px-8 py-6 text-white"
            style={{
              background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor || "#0f172a"})`,
            }}
          >
            {brand.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt={brand.name} className="h-8 mb-4 object-contain" />
            )}
            <h3 className="text-xl font-bold">{payment.name}</h3>
            <p className="text-white/70 text-sm mt-1">{payment.description}</p>
            <div className="mt-4 flex items-baseline gap-2">
              {isFree ? (
                <span className="text-4xl font-bold">Free</span>
              ) : (
                <>
                  <span className="text-4xl font-bold">{formattedAmount}</span>
                  {couponApplied && (
                    <span className="text-white/50 line-through text-xl">
                      {formatCurrency(payment.amount, payment.currency)}
                    </span>
                  )}
                  <span className="text-white/50 text-sm">{payment.currency}</span>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="bg-white px-8 py-6 flex flex-col gap-4">
            <Field label="Full Name *" type="text" value={name} onChange={setName} placeholder="Priya Sharma" brand={brand} />
            <Field label="Email Address *" type="email" value={email} onChange={setEmail} placeholder="priya@example.com" brand={brand} />
            <Field label="Phone Number" type="tel" value={phone} onChange={setPhone} placeholder="+91 98765 43210" brand={brand} />

            {/* Product variant selectors */}
            {variants?.map((variant) => (
              <div key={variant.label}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {variant.label} *
                </label>
                <select
                  value={selectedVariants[variant.label] ?? ""}
                  onChange={(e) => setSelectedVariants((prev) => ({ ...prev, [variant.label]: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white"
                  onFocus={(e) => (e.target.style.borderColor = brand.primaryColor)}
                  onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                >
                  <option value="">Select {variant.label}</option>
                  {variant.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}

            {/* Custom fields */}
            {payment.customFields?.map((field) => (
              <div key={field.label}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {field.label}{field.required ? " *" : ""}
                </label>
                {field.type === "select" && field.options ? (
                  <select
                    value={customFieldValues[field.label] ?? ""}
                    onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white"
                    onFocus={(e) => (e.target.style.borderColor = brand.primaryColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  >
                    <option value="">Select...</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customFieldValues[field.label] ?? ""}
                    onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none transition-all"
                    onFocus={(e) => (e.target.style.borderColor = brand.primaryColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                )}
              </div>
            ))}

            {/* Coupon input */}
            {payment.couponConfig && !couponApplied && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Coupon Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setCouponError(""); }}
                    placeholder={`e.g. ${payment.couponConfig.code}`}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none transition-all uppercase"
                    onFocus={(e) => (e.target.style.borderColor = brand.primaryColor)}
                    onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                  />
                  <button
                    type="button"
                    onClick={applyForcedCoupon}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                    style={{ borderColor: brand.primaryColor, color: brand.primaryColor }}
                  >
                    Apply
                  </button>
                </div>
                {couponError && <p className="text-red-500 text-xs mt-1">{couponError}</p>}
              </div>
            )}
            {couponApplied && payment.couponConfig && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                ✓ Coupon <strong>{payment.couponConfig.code}</strong> applied — {payment.couponConfig.discountPercent}% off
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={loading}
              className={cn(
                "w-full py-4 rounded-2xl text-white font-bold text-lg mt-2 transition-all duration-200",
                "hover:scale-[1.02] active:scale-[0.98]",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100",
                "shadow-lg"
              )}
              style={{
                background: loading
                  ? "#9ca3af"
                  : `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor || brand.primaryColor})`,
                boxShadow: !loading ? `0 8px 24px -4px ${brand.primaryColor}50` : undefined,
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing…
                </span>
              ) : isFree ? (
                "Register for Free"
              ) : (
                `Pay ${formattedAmount}`
              )}
            </button>

            {!isFree && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <LockIcon />
                  Secure &amp; encrypted
                </span>
                <span className="text-gray-200">·</span>
                <span className="text-xs text-gray-400">Powered by Razorpay</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label, type, value, onChange, placeholder, brand,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; brand: Brand;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none transition-all"
        onFocus={(e) => (e.target.style.borderColor = brand.primaryColor)}
        onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
      />
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="mb-4 flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
      <span className="text-base mt-0.5">🧪</span>
      <div>
        <span className="font-semibold">Demo mode</span>
        <span className="text-amber-700"> — no real payment will be charged. </span>
        <span className="text-amber-600">Add a Razorpay key to go live.</span>
      </div>
    </div>
  );
}

function SuccessState({
  brand, name, amount, isFree,
}: {
  brand: Brand; name: string; amount: string; isFree: boolean;
}) {
  return (
    <section className="py-16" id="pay">
      <div className="container mx-auto px-4 max-w-md">
        <div
          className="rounded-3xl overflow-hidden shadow-2xl text-center"
          style={{ boxShadow: `0 25px 60px -10px ${brand.primaryColor}30` }}
        >
          <div
            className="px-8 py-10 text-white"
            style={{
              background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor || "#0f172a"})`,
            }}
          >
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✅
            </div>
            <h3 className="text-2xl font-bold mb-2">
              {isFree ? "You&apos;re registered!" : "Payment Successful!"}
            </h3>
            <p className="text-white/80">
              {isFree
                ? `Welcome, ${name || "there"}! Your spot is confirmed.`
                : `Thank you, ${name || "there"}! Your payment of ${amount} was received.`}
            </p>
          </div>
          <div className="bg-white px-8 py-6">
            <p className="text-sm text-gray-500">
              You&apos;ll hear from the organiser shortly with next steps.
            </p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="mt-4 text-sm font-semibold underline underline-offset-2"
              style={{ color: brand.primaryColor }}
            >
              Back to top
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
