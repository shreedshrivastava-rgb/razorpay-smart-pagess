"use client";

import { useState } from "react";
import type { Payment, Brand } from "@/lib/schema/page-schema";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface PaymentBlockProps {
  payment: Payment;
  brand: Brand;
  pageTitle: string;
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
// Set NEXT_PUBLIC_RAZORPAY_LIVE=true to open the real Razorpay modal with a live key
const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID === "rzp_test_placeholder" ||
  (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.startsWith("rzp_live") &&
    process.env.NEXT_PUBLIC_RAZORPAY_LIVE !== "true");

export function PaymentBlock({ payment, brand }: PaymentBlockProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDemoSuccess, setShowDemoSuccess] = useState(false);

  const formattedAmount = formatCurrency(payment.amount, payment.currency);
  const isDemoKey =
    IS_DEMO_MODE ||
    payment.razorpayKeyId === "rzp_test_placeholder" ||
    !payment.razorpayKeyId;

  async function handlePay() {
    if (!name || !email) return;
    if (!payment.amount || payment.amount <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);

    if (isDemoKey) {
      // Demo mode — simulate payment flow
      await new Promise((r) => setTimeout(r, 1800));
      setLoading(false);
      setShowDemoSuccess(true);
      return;
    }

    try {
      // Step 1: create a server-side order so amount can't be tampered client-side
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: payment.amount,
          currency: payment.currency,
          receipt: `receipt_${Date.now()}`,
        }),
      });

      if (!orderRes.ok) {
        throw new Error(`Order creation failed: ${orderRes.status}`);
      }

      const { orderId } = await orderRes.json() as { orderId: string };

      // Step 2: load checkout.js if not already present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!w.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
          document.head.appendChild(s);
        });
      }

      // Step 3: open checkout with order_id
      const RazorpayCtor = w.Razorpay as RazorpayCtor;
      const rzp = new RazorpayCtor({
        key: payment.razorpayKeyId,
        order_id: orderId,
        amount: payment.amount,
        currency: payment.currency,
        name: brand.name,
        description: payment.name,
        image: brand.logo,
        prefill: { name, email, contact: phone },
        theme: { color: payment.theme?.color || brand.primaryColor },
        handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          // Payment IDs available here for server-side verification if needed:
          // response.razorpay_payment_id, response.razorpay_order_id, response.razorpay_signature
          void response;
          setLoading(false);
          setShowDemoSuccess(true);
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (err) {
      console.error("Payment error:", err);
      setLoading(false);
    }
  }

  if (showDemoSuccess) {
    return <SuccessState brand={brand} name={name} amount={formattedAmount} />;
  }

  return (
    <section className="py-16" id="pay">
      <div className="container mx-auto px-4 max-w-md">
        {isDemoKey && <DemoBanner />}

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
              <span className="text-4xl font-bold">{formattedAmount}</span>
              <span className="text-white/50 text-sm">{payment.currency}</span>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white px-8 py-6 flex flex-col gap-4">
            <Field
              label="Full Name *"
              type="text"
              value={name}
              onChange={setName}
              placeholder="Priya Sharma"
              brand={brand}
            />
            <Field
              label="Email Address *"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="priya@example.com"
              brand={brand}
            />
            <Field
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="+91 98765 43210"
              brand={brand}
            />

            <button
              onClick={handlePay}
              disabled={loading || !name || !email}
              className={cn(
                "w-full py-4 rounded-2xl text-white font-bold text-lg mt-2 transition-all duration-200",
                "hover:scale-[1.02] active:scale-[0.98]",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100",
                "shadow-lg"
              )}
              style={{
                background:
                  !name || !email
                    ? "#9ca3af"
                    : `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor || brand.primaryColor})`,
                boxShadow:
                  name && email ? `0 8px 24px -4px ${brand.primaryColor}50` : undefined,
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isDemoKey ? "Processing demo…" : "Opening payment…"}
                </span>
              ) : (
                `Pay ${formattedAmount}`
              )}
            </button>

            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <LockIcon />
                Secure &amp; encrypted
              </span>
              <span className="text-gray-200">·</span>
              <span className="text-xs text-gray-400">Powered by Razorpay</span>
            </div>
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
        style={
          { "--focus-color": brand.primaryColor } as React.CSSProperties
        }
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
  brand, name, amount,
}: {
  brand: Brand; name: string; amount: string;
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
            <h3 className="text-2xl font-bold mb-2">Payment Successful!</h3>
            <p className="text-white/80">
              Thank you, {name || "there"}! Your payment of {amount} was received.
            </p>
          </div>
          <div className="bg-white px-8 py-6">
            <p className="text-sm text-gray-500">
              A confirmation has been sent to your email. You&apos;ll hear from us shortly.
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
