"use client";

import type { PageSchema, Section, Brand, Payment } from "@/lib/schema/page-schema";
import { SectionRenderer } from "@/components/blocks/SectionRenderer";
import { formatCurrency, cn } from "@/lib/utils";
import { useState } from "react";

interface PageRendererProps {
  page: PageSchema;
  isPreview?: boolean;
}

function sanitizeHexColor(color: string | undefined, fallback: string): string {
  if (color && /^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  return fallback;
}

export function PageRenderer({ page, isPreview = false }: PageRendererProps) {
  const { brand, sections, payment } = page;

  const primaryColor = sanitizeHexColor(brand.primaryColor, "#6366f1");
  const secondaryColor = sanitizeHexColor(brand.secondaryColor, "#0f172a");
  const accentColor = sanitizeHexColor(brand.accentColor, primaryColor);

  const brandStyle = {
    "--brand-primary": primaryColor,
    "--brand-secondary": secondaryColor,
    "--brand-accent": accentColor,
    fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif",
  } as React.CSSProperties;

  const wrapper = cn("min-h-screen font-sans antialiased bg-white", isPreview && "pointer-events-auto");

  // ── Landing page: full persuasion funnel, payment card at bottom ──
  if (page.pageType === "landing") {
    return (
      <div className={wrapper} style={brandStyle}>
        <CheckoutNav brand={brand} payment={payment} />
        <LandingHero page={page} brand={brand} payment={payment} />
        <div className="bg-white">
          {sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              brand={brand}
              onCtaClick={() => document.getElementById("pay")?.scrollIntoView({ behavior: "smooth" })}
              razorpayKeyId={payment.razorpayKeyId}
            />
          ))}
        </div>
        {/* Payment anchored at the bottom for landing pages */}
        <div id="pay" className="py-16 bg-gray-50">
          <div className="container mx-auto px-4 max-w-md">
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">
              Get started today
            </h2>
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <InlinePaymentCard page={page} brand={brand} />
            </div>
          </div>
        </div>
        <CheckoutFooter brand={brand} />
      </div>
    );
  }

  // ── Collection page: multi-product grid, no single payment sidebar ──
  if (page.pageType === "collection") {
    return (
      <div className={wrapper} style={brandStyle}>
        <CheckoutNav brand={brand} payment={payment} />
        <CollectionHero brand={brand} payment={payment} />
        <div className="bg-white">
          {sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              brand={brand}
              onCtaClick={() => {}}
              razorpayKeyId={payment.razorpayKeyId}
            />
          ))}
        </div>
        <CheckoutFooter brand={brand} />
      </div>
    );
  }

  // ── Default: checkout-optimised layout (sidebar payment card) ──
  const belowFoldTypes = new Set(["testimonials", "faq", "agenda", "speakers", "stats", "cta"]);
  const aboveSections = sections.filter((s) => !belowFoldTypes.has(s.type));
  const belowSections = sections.filter((s) => belowFoldTypes.has(s.type));

  return (
    <div className={wrapper} style={brandStyle}>
      <a href="#pay" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-white focus:text-gray-900 focus:rounded focus:shadow-lg focus:text-sm">
        Skip to payment
      </a>
      <CheckoutNav brand={brand} payment={payment} />
      <CheckoutHero page={page} brand={brand} payment={payment} aboveSections={aboveSections} />

      {belowSections.length > 0 && (
        <div className="bg-white">
          {belowSections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              brand={brand}
              onCtaClick={() => {}}
              razorpayKeyId={payment.razorpayKeyId}
            />
          ))}
        </div>
      )}

      <CheckoutFooter brand={brand} />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────
function CheckoutNav({ brand, payment }: { brand: Brand; payment: Payment }) {
  return (
    <header className="bg-white border-b border-black/[0.07] sticky top-0 z-40">
      <div className="container mx-auto px-5 max-w-6xl h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo}
              alt={brand.name}
              width={112}
              height={28}
              className="h-7 w-auto object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shrink-0"
              style={{ backgroundColor: brand.primaryColor }}
              aria-hidden="true"
            >
              {brand.name[0]}
            </div>
          )}
          <span className="font-bold text-gray-900 text-sm tracking-tight truncate">{brand.name}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
          <LockIcon className="w-3 h-3" aria-hidden="true" />
          <span>Secure checkout</span>
          {payment.amount > 0 && (
            <>
              <span className="text-gray-200 mx-0.5" aria-hidden="true">·</span>
              <span
                className="font-extrabold text-gray-900 text-sm tabular-nums"
                translate="no"
              >
                {formatCurrency(payment.amount, payment.currency)}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────
function CheckoutHero({
  page,
  brand,
  payment,
  aboveSections,
}: {
  page: PageSchema;
  brand: Brand;
  payment: Payment;
  aboveSections: Section[];
}) {
  const bullets: string[] = (page.productBullets as string[] | undefined) ?? [];
  const featureSection = aboveSections.find((s) => s.type === "features" || s.type === "benefits");
  const derivedBullets =
    bullets.filter(Boolean).length > 0
      ? bullets.filter(Boolean)
      : (featureSection as { items?: Array<{ title: string }> } | undefined)
          ?.items?.slice(0, 6)
          .map((i) => i.title) ?? [];

  const trustSection = aboveSections.find((s) => s.type === "trust");
  const imageUrl = page.productImageUrl;
  const galleryImages = page.productImages && page.productImages.length > 1 ? page.productImages : null;

  return (
    <section className="py-8 md:py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Aesthetic signature: left column has brand-tinted background (brand world),
            right column stays white (transaction world) — mirrors how physical retail works */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0 lg:gap-px rounded-2xl overflow-hidden border border-black/[0.07] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)]">

          {/* LEFT: brand world */}
          <div
            className="p-6 md:p-8 flex flex-col gap-6"
            style={{ backgroundColor: `${brand.primaryColor}0c` }}
          >
            {/* Product visual */}
            {imageUrl ? (
              <div className="flex flex-col gap-2">
                <div className="rounded-xl overflow-hidden aspect-[4/3] shadow-sm bg-gray-50 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={payment.name}
                    width={600}
                    height={450}
                    className="w-full h-full object-contain"
                    fetchPriority="high"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                </div>
                {galleryImages && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((src, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={src}
                        alt={`${payment.name} ${i + 1}`}
                        className="w-16 h-16 rounded-lg object-cover shrink-0 border-2 border-white shadow-sm"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <BrandedProductCard brand={brand} payment={payment} pageType={page.pageType} />
            )}

            {/* Product name + price — the biggest type on the page */}
            <div className="flex flex-col gap-1.5">
              {/* Eyebrow */}
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: `${brand.primaryColor}99` }}
              >
                {page.pageType}
              </p>
              <h1
                className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight"
                style={{ textWrap: "balance" } as React.CSSProperties}
              >
                {payment.name}
              </h1>
              {payment.amount > 0 && (
                <p
                  className="text-3xl font-extrabold tabular-nums"
                  style={{ color: brand.primaryColor }}
                  translate="no"
                >
                  {formatCurrency(payment.amount, payment.currency)}
                </p>
              )}
              {payment.description && (
                <p className="text-gray-500 text-sm leading-relaxed mt-1">
                  {payment.description}
                </p>
              )}
            </div>

            {/* Feature bullets — Sweetgreen-inspired ingredient cards */}
            {derivedBullets.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {derivedBullets.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-white/70 backdrop-blur-sm rounded-lg px-2.5 py-2 border border-black/[0.06]"
                  >
                    <span
                      className="mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${brand.primaryColor}20`, color: brand.primaryColor }}
                      aria-hidden="true"
                    >
                      <CheckIcon />
                    </span>
                    <span className="text-gray-700 text-xs leading-snug font-semibold">{b}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Trust badges */}
            {trustSection && trustSection.type === "trust" && (
              <div className="flex flex-wrap gap-2">
                {trustSection.items.map((item, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 text-xs text-gray-600 bg-white/80 rounded-full px-3 py-1.5 border border-black/[0.06] font-semibold"
                  >
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: transaction world */}
          <div className="bg-white p-6 md:p-8 lg:sticky lg:top-[57px] lg:self-start">
            <InlinePaymentCard page={page} brand={brand} />
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── Payment card ──────────────────────────────────────────────────
const IS_DEMO_MODE =
  !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID === "rzp_test_placeholder" ||
  (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.startsWith("rzp_live") &&
    process.env.NEXT_PUBLIC_RAZORPAY_LIVE !== "true");

function InlinePaymentCard({ page, brand }: { page: PageSchema; brand: Brand }) {
  const { payment } = page;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const isFree = !payment.amount || payment.amount <= 0;
  const isDemoKey =
    IS_DEMO_MODE ||
    !payment.razorpayKeyId ||
    payment.razorpayKeyId === "rzp_test_placeholder";

  const discount = couponApplied && payment.couponConfig
    ? Math.round(payment.amount * payment.couponConfig.discountPercent / 100)
    : 0;
  const effectiveAmount = payment.amount - discount;
  const formatted = isFree ? "Free" : formatCurrency(effectiveAmount, payment.currency);

  function applyCoupon() {
    setCouponError("");
    if (!payment.couponConfig) return;
    if (couponCode.trim().toUpperCase() === payment.couponConfig.code.toUpperCase()) {
      setCouponApplied(true);
    } else {
      setCouponError("Invalid coupon code.");
    }
  }

  const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  function validateForm(): string {
    if (!name.trim()) return "Please enter your full name.";
    if (!email.trim() || !EMAIL_RE.test(email.trim())) return "Please enter a valid email address.";
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) return "Please enter a valid phone number (7–15 digits).";
    }
    for (const v of page.variants ?? []) {
      const chosen = selectedVariants[v.label];
      if (!chosen) return `Please select a ${v.label}.`;
      if (!v.options.includes(chosen)) return `Invalid ${v.label} selection. Please choose again.`;
    }
    for (const f of payment.customFields ?? []) {
      if (f.required && !customFieldValues[f.label]?.trim()) return `"${f.label}" is required.`;
    }
    return "";
  }

  async function handlePay() {
    const validationErr = validateForm();
    if (validationErr) { setError(validationErr); return; }
    setLoading(true);
    setError("");

    if (isFree || isDemoKey) {
      await new Promise((r) => setTimeout(r, 1200));
      setLoading(false);
      setSuccess(true);
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
          slug: page.slug,
        }),
      });
      if (!orderRes.ok) {
        const { error: errMsg } = await orderRes.json() as { error?: string };
        throw new Error(errMsg || `Order creation failed (${orderRes.status})`);
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (w.Razorpay as any)({
        key: payment.razorpayKeyId,
        order_id: orderId,
        amount: effectiveAmount,
        currency: payment.currency,
        name: brand.name,
        description: payment.name,
        image: brand.logo,
        prefill: { name, email, contact: phone },
        theme: { color: payment.theme?.color || brand.primaryColor },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
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
            if (!verifyRes.ok) throw new Error("Signature mismatch");
            setLoading(false);
            setSuccess(true);
          } catch {
            setLoading(false);
            setError("Payment could not be verified. Please contact support.");
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      }).open();
    } catch (err) {
      console.error("Payment error:", err);
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center text-center gap-5 py-10" id="pay">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{ backgroundColor: `${brand.primaryColor}18`, color: brand.primaryColor }}
          role="img"
          aria-label="Order confirmed"
        >
          ✓
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {isFree ? "You’re registered!" : "Payment Successful!"}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {isFree
              ? `Welcome, ${name}! Your spot is confirmed.`
              : `Thank you, ${name}. You’ll hear from the organiser shortly.`}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full"
          style={{ backgroundColor: `${brand.primaryColor}12`, color: brand.primaryColor }}
        >
          <LockIcon className="w-3 h-3" aria-hidden="true" />
          {isFree ? "Spot confirmed" : "Payment verified by Razorpay"}
        </span>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100" id="pay">

      {/* ── Section 1: Product title + description + stars ── */}
      <div className="pb-5">
        <h2 className="text-2xl font-bold text-gray-900 leading-snug tracking-tight">
          {payment.name}
        </h2>
        {payment.description && (
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{payment.description}</p>
        )}
        <div className="flex items-center gap-1.5 mt-3" aria-label="4.9 out of 5 stars">
          {[1, 2, 3, 4, 5].map((i) => (
            <svg key={i} className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
              style={{ color: i <= 5 ? brand.primaryColor : "#e5e7eb" }}>
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
          <span className="text-sm text-gray-400 ml-0.5">4.9 <span className="text-gray-300">(121)</span></span>
        </div>
      </div>

      {/* ── Section 2: Price ── */}
      <div className="py-5">
        {isFree ? (
          <p className="text-2xl font-bold text-gray-900">Free</p>
        ) : (
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-gray-900 tabular-nums" translate="no">
              {formatted}
            </p>
            {couponApplied && (
              <p className="text-base text-gray-400 line-through tabular-nums" translate="no">
                {formatCurrency(payment.amount, payment.currency)}
              </p>
            )}
          </div>
        )}
        {!isFree && (isDemoKey ? (
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1" role="status" aria-live="polite">
            <span aria-hidden="true">🧪</span> Demo mode — no real charge will be made
          </p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">Secured payments with UPI, Cards &amp; Wallets</p>
        ))}
      </div>

      {/* ── Section 3: Form fields ── */}
      <div className="py-5">
        <form
          onSubmit={(e) => { e.preventDefault(); void handlePay(); }}
          className="flex flex-col gap-4"
          noValidate
        >
          <PayField id="pay-name" label="Full Name" required type="text" name="name"
            autoComplete="name" value={name} onChange={setName} placeholder="Priya Sharma" brand={brand} />
          <PayField id="pay-email" label="Email Address" required type="email" name="email"
            autoComplete="email" spellCheck={false} value={email} onChange={setEmail}
            placeholder="priya@example.com" brand={brand} />
          <PayField id="pay-phone" label="Phone Number" type="tel" name="phone"
            autoComplete="tel" inputMode="tel" value={phone} onChange={setPhone}
            placeholder="+91 98765 43210" brand={brand} />

          {/* Product variant selectors */}
          {(page.variants ?? []).map((variant) => (
            <div key={variant.label}>
              <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                {variant.label}
                <span className="text-red-400 leading-none" aria-hidden="true">*</span>
              </label>
              <select
                value={selectedVariants[variant.label] ?? ""}
                onChange={(e) => setSelectedVariants((p) => ({ ...p, [variant.label]: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none transition-colors"
                onFocus={(e) => { e.target.style.borderColor = brand.primaryColor; }}
                onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; }}
              >
                <option value="">Select {variant.label}…</option>
                {variant.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          ))}

          {/* Custom fields */}
          {(payment.customFields ?? []).map((field) => (
            <div key={field.label}>
              <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-400 leading-none" aria-hidden="true">*</span>}
              </label>
              {field.type === "select" && field.options ? (
                <select
                  value={customFieldValues[field.label] ?? ""}
                  onChange={(e) => setCustomFieldValues((p) => ({ ...p, [field.label]: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none transition-colors"
                  onFocus={(e) => { e.target.style.borderColor = brand.primaryColor; }}
                  onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; }}
                >
                  <option value="">Select…</option>
                  {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <PayField id={`cf-${field.label}`} label="" type="text" name={field.label}
                  autoComplete="off" value={customFieldValues[field.label] ?? ""}
                  onChange={(v) => setCustomFieldValues((p) => ({ ...p, [field.label]: v }))}
                  placeholder="" brand={brand} />
              )}
            </div>
          ))}

          {/* Coupon code */}
          {payment.couponConfig && !couponApplied && (
            <div>
              <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value); setCouponError(""); }}
                  placeholder="Enter code"
                  className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm uppercase focus:outline-none"
                  onFocus={(e) => { e.target.style.borderColor = brand.primaryColor; }}
                  onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; }}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors"
                  style={{ borderColor: brand.primaryColor, color: brand.primaryColor }}
                >
                  Apply
                </button>
              </div>
              {couponError && (
                <p className="text-xs text-red-600 mt-1">{couponError}</p>
              )}
            </div>
          )}
          {couponApplied && payment.couponConfig && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              ✓ <strong>{payment.couponConfig.code}</strong> applied — {payment.couponConfig.discountPercent}% off
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
              role="alert" aria-live="assertive">
              ⚠ {error}
            </p>
          )}

          {/* ── Section 4: CTA button ── */}
          <div className="pt-1 flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex-1 py-4 rounded-full text-white font-bold text-base",
                "flex items-center justify-center gap-2",
                "transition-opacity transition-transform duration-150",
                "hover:opacity-90 active:scale-[0.98]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              )}
              style={{
                backgroundColor: brand.primaryColor,
                boxShadow: !loading ? `0 4px 16px -2px ${brand.primaryColor}50` : undefined,
                ["--tw-ring-color" as string]: brand.primaryColor,
                touchAction: "manipulation",
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{isDemoKey ? "Simulating…" : "Opening checkout…"}</span>
                </>
              ) : isFree ? (
                "Register for Free"
              ) : (
                <>
                  <LockIcon className="w-4 h-4 opacity-80 shrink-0" aria-hidden="true" />
                  <span translate="no">Pay {formatted}</span>
                </>
              )}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className={cn(
                "px-5 py-4 rounded-full font-semibold text-sm border-2",
                "transition-colors duration-150",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              )}
              style={{
                borderColor: brand.primaryColor,
                color: brand.primaryColor,
                ["--tw-ring-color" as string]: brand.primaryColor,
                touchAction: "manipulation",
              }}
              aria-label="Learn more"
            >
              Details
            </button>
          </div>
        </form>
      </div>

      {/* ── Section 5: Trust cards ── */}
      {!isFree && (
        <div className="pt-1 divide-y divide-gray-100">
          <div className="flex items-start gap-3.5 py-4">
            <span className="text-xl mt-0.5 shrink-0" aria-hidden="true">🔒</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Secured Payment</p>
              <p className="text-xs text-gray-400 mt-0.5">SSL encrypted &amp; verified by Razorpay</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5 py-4">
            <span className="text-xl mt-0.5 shrink-0" aria-hidden="true">↩️</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Easy Refunds</p>
              <p className="text-xs text-gray-400 mt-0.5">Hassle-free refund policy.</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

interface PayFieldProps {
  id: string;
  label: string;
  required?: boolean;
  type: string;
  name: string;
  autoComplete: string;
  spellCheck?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  brand: Brand;
}

function PayField({ id, label, required, type, name, autoComplete, spellCheck, inputMode, value, onChange, placeholder, brand }: PayFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
        {label}
        {required && <span className="text-red-400 leading-none" aria-hidden="true">*</span>}
        {required && <span className="sr-only">(required)</span>}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        inputMode={inputMode}
        required={required}
        className={cn(
          "w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400",
          "transition-colors transition-shadow duration-150",
          "focus:outline-none focus:bg-white focus-visible:ring-2 focus-visible:ring-offset-0",
        )}
        style={{ ["--tw-ring-color" as string]: brand.primaryColor }}
        onFocus={(e) => {
          e.target.style.borderColor = brand.primaryColor;
          e.target.style.boxShadow = `0 0 0 3px ${brand.primaryColor}18`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#e5e7eb";
          e.target.style.boxShadow = "none";
        }}
      />
    </div>
  );
}

// ─── Branded product card (no-image fallback) ─────────────────────
function darken(hex: string, factor: number): string {
  const h = hex.replace(/^#/, "").padEnd(6, "0");
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * factor));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * factor));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * factor));
  return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
}

function inferProductEmoji(productName: string, pageType: string): string {
  const n = productName.toLowerCase();
  if (/cake|bake|bak|pastry|cookie|brownie|dessert|tiramisu/.test(n)) return "🎂";
  if (/jam|preserve|chutney|pickle|spread|marmalade/.test(n)) return "🍓";
  if (/coffee|tea|brew|chai/.test(n)) return "☕";
  if (/candle|wax|aroma/.test(n)) return "🕯️";
  if (/jewel|ring|necklace|bracelet|earring/.test(n)) return "💎";
  if (/plant|flower|herb|garden/.test(n)) return "🌿";
  if (/art|paint|sketch|print/.test(n)) return "🎨";
  if (/bag|tote|clutch|purse/.test(n)) return "👜";
  if (/cloth|shirt|dress|fabric|stitch|knit|sew/.test(n)) return "👗";
  if (/soap|skincare|cream|lotion/.test(n)) return "✨";
  if (/book|course|guide|class|lesson/.test(n)) return "📖";
  if (/yoga|fitness|health|wellness/.test(n)) return "🧘";
  if (/juice|drink|beverage|smoothie/.test(n)) return "🥤";
  if (/wine|beer|spirit|whiskey/.test(n)) return "🍷";
  if (/furniture|sofa|chair|table/.test(n)) return "🛋️";
  if (/headphone|earphone|speaker|audio/.test(n)) return "🎧";
  const fallbacks: Record<string, string> = {
    product: "🛍️", service: "⚡", course: "📚",
    workshop: "🎓", event: "🎉", consultation: "💡",
    saas: "🚀", subscription: "🌟",
  };
  return fallbacks[pageType] ?? "✦";
}

function BrandedProductCard({ brand, payment, pageType }: { brand: Brand; payment: Payment; pageType: string }) {
  const primary = brand.primaryColor || "#6366f1";
  const deep = darken(primary, 0.22);
  const emoji = inferProductEmoji(payment.name, pageType);
  const formattedPrice = formatCurrency(payment.amount, payment.currency);

  return (
    <div
      className="rounded-xl aspect-[4/3] overflow-hidden relative select-none shadow-sm"
      role="img"
      aria-label={`${payment.name} product visual`}
      style={{
        background: `
          radial-gradient(ellipse 90% 60% at 70% 15%, ${primary}50 0%, transparent 65%),
          radial-gradient(ellipse 60% 80% at 10% 85%, ${primary}30 0%, transparent 55%),
          linear-gradient(150deg, ${deep} 0%, #080810 100%)
        `,
      }}
    >
      {/* Grain texture */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.055 }}
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="pg">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#pg)" />
      </svg>

      {/* Brand badge top-left */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-white font-extrabold text-xs shrink-0"
          style={{ backgroundColor: primary }}
          aria-hidden="true"
        >
          {brand.name[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">{brand.name}</p>
          {brand.tagline && (
            <p className="text-white/40 text-[10px] mt-0.5 leading-none">{brand.tagline}</p>
          )}
        </div>
      </div>

      {/* Central emoji */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[96px] leading-none"
        style={{ filter: `drop-shadow(0 8px 24px ${primary}60)` }}
        aria-hidden="true"
      >
        {emoji}
      </div>

      {/* Bottom: product name + price */}
      <div
        className="absolute bottom-0 left-0 right-0 px-5 pt-8 pb-4"
        style={{ background: `linear-gradient(to top, rgba(8,8,16,0.92) 0%, transparent 100%)` }}
      >
        <h2 className="text-white font-extrabold text-xl leading-tight" style={{ textWrap: "balance" } as React.CSSProperties}>
          {payment.name}
        </h2>
        {payment.amount > 0 && (
          <p className="font-bold text-base mt-0.5 tabular-nums" style={{ color: primary }} translate="no">
            {formattedPrice}
          </p>
        )}
      </div>

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }}
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Landing page hero (full-width, no sidebar payment card) ─────
function LandingHero({ page, brand, payment }: { page: PageSchema; brand: Brand; payment: Payment }) {
  const heroSection = page.sections.find((s) => s.type === "hero");
  const headline = heroSection?.type === "hero" ? heroSection.headline : payment.name;
  const subheadline = heroSection?.type === "hero" ? heroSection.subheadline : payment.description;
  const badge = heroSection?.type === "hero" ? heroSection.badge : undefined;
  const urgency = heroSection?.type === "hero" ? heroSection.urgency : undefined;

  return (
    <section
      className="py-20 md:py-28 text-center relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${brand.primaryColor}18 0%, transparent 70%), #fff`,
      }}
    >
      <div className="container mx-auto px-4 max-w-3xl relative">
        {badge && (
          <span
            className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold mb-5 uppercase tracking-wider"
            style={{ backgroundColor: `${brand.primaryColor}15`, color: brand.primaryColor }}
          >
            {badge}
          </span>
        )}
        {brand.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt={brand.name} className="h-10 mx-auto mb-6 object-contain" />
        )}
        <h1
          className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-[1.05] tracking-tight mb-6"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          {headline}
        </h1>
        {subheadline && (
          <p className="text-xl text-gray-500 leading-relaxed mb-8 max-w-2xl mx-auto">
            {subheadline}
          </p>
        )}
        {payment.amount > 0 && (
          <p className="text-4xl font-extrabold mb-8 tabular-nums" style={{ color: brand.primaryColor }} translate="no">
            {formatCurrency(payment.amount, payment.currency)}
          </p>
        )}
        {urgency && (
          <p className="text-sm text-orange-600 font-semibold mb-4">{urgency}</p>
        )}
        <a
          href="#pay"
          className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full text-white font-bold text-lg shadow-lg hover:opacity-90 transition-opacity"
          style={{ backgroundColor: brand.primaryColor, boxShadow: `0 8px 32px -4px ${brand.primaryColor}60` }}
        >
          {payment.amount > 0 ? `Get started — ${formatCurrency(payment.amount, payment.currency)}` : "Get started for free"}
          <span aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}

// ─── Collection page hero (full-width, CTA scrolls to products) ───
function CollectionHero({ brand, payment }: { brand: Brand; payment: Payment }) {
  return (
    <section
      className="py-16 md:py-20 text-center"
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${brand.primaryColor}18 0%, transparent 70%), #fff`,
      }}
    >
      <div className="container mx-auto px-4 max-w-3xl">
        {brand.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt={brand.name} className="h-10 mx-auto mb-5 object-contain" />
        )}
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-4">
          {brand.name}
        </h1>
        {payment.description && (
          <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-xl mx-auto">
            {payment.description}
          </p>
        )}
        <a
          href="#products"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white font-bold text-base hover:opacity-90 transition-opacity"
          style={{ backgroundColor: brand.primaryColor }}
        >
          Browse collection
          <span aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────
function CheckoutFooter({ brand }: { brand: Brand }) {
  return (
    <footer className="bg-white border-t border-black/[0.06] py-8 mt-6">
      <div className="container mx-auto px-5 max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
        <span className="font-semibold">{brand.name} · All rights reserved</span>
        <span className="flex items-center gap-1.5">
          <LockIcon className="w-3 h-3" aria-hidden="true" />
          Payments secured by Razorpay
        </span>
      </div>
    </footer>
  );
}

// ─── Icons ────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ className, "aria-hidden": ariaHidden }: { className?: string; "aria-hidden"?: boolean | "true" | "false" }) {
  return (
    <svg
      className={cn("w-4 h-4", className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden={ariaHidden}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
