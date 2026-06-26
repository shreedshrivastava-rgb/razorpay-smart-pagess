"use client";

import type { PageSchema, Section, Brand, Payment } from "@/lib/schema/page-schema";
import { SectionRenderer } from "@/components/blocks/SectionRenderer";
import { formatCurrency, cn } from "@/lib/utils";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { EditModeProvider, useEditMode } from "@/components/editor/EditModeContext";
import { EditableSection } from "@/components/editor/EditableSection";
import { uploadImage } from "@/lib/image-store";
import { inferProductEmoji, darken } from "@/lib/product-visual";
import { generatedImageUrl, heroImagePrompt, productImagePrompt } from "@/lib/image-gen";

interface PageRendererProps {
  page: PageSchema;
  isPreview?: boolean;
  isProtected?: boolean;
  isDraft?: boolean;
  // True only when the signed-in viewer owns this page (server-verified).
  // Gates the edit pencil so public buyers never see it.
  isOwner?: boolean;
}

function sanitizeHexColor(color: string | undefined, fallback: string): string {
  if (color && /^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  return fallback;
}

// ─── Shared save utility ─────────────────────────────────────────
// Prices/amounts are stored in paise; the inline editors show/accept rupees.
function paiseToRupeesInput(paiseStr: string): string {
  if (paiseStr === "") return "";
  const n = Number(paiseStr);
  return Number.isNaN(n) ? "" : String(Math.round(n) / 100);
}
function rupeesInputToPaise(rupeesStr: string): string {
  if (rupeesStr === "") return "";
  const paise = Math.round(parseFloat(rupeesStr) * 100);
  return String(Number.isNaN(paise) ? 0 : paise);
}

async function commitPageEdits(page: PageSchema, fields: Record<string, string>): Promise<void> {
  const updated = JSON.parse(JSON.stringify(page)) as PageSchema;
  for (const [path, value] of Object.entries(fields)) {
    const parts = path.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let obj: unknown = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj = (obj as Record<string, unknown>)[parts[i]];
      if (!obj) break;
    }
    const lastKey = parts[parts.length - 1];
    // Coerce known numeric fields so the schema stays valid
    const numericKeys = new Set(["amount", "price", "maxPrice", "minPrice"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coerced: unknown = numericKeys.has(lastKey) && value !== "" && !isNaN(Number(value)) ? Number(value) : value;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (obj) (obj as Record<string, unknown>)[lastKey] = coerced;
  }
  const editToken = (() => { try { return localStorage.getItem(`edit_token_${page.slug}`) ?? ""; } catch { return ""; } })();
  const res = await fetch(`/api/pages/${page.slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Edit-Token": editToken },
    body: JSON.stringify(updated),
  });
  if (res.status === 403) throw new Error("Not authorized — only the page creator can save changes.");
  if (!res.ok) throw new Error("Save failed. Try again.");
}

// ─── Shared edit pencil — works for every page type ─────────────
function WithEditPencil({ page, isProtected, isDraft, isOwner, children }: { page: PageSchema; isProtected: boolean; isDraft?: boolean; isOwner?: boolean; children: ReactNode }) {
  return (
    <EditModeProvider canEdit={!!isOwner}>
      <EditPencilInner page={page} isProtected={isProtected} isDraft={isDraft} isOwner={isOwner}>
        {children}
      </EditPencilInner>
    </EditModeProvider>
  );
}

function EditPencilInner({ page, isProtected, isDraft, isOwner, children }: { page: PageSchema; isProtected: boolean; isDraft?: boolean; isOwner?: boolean; children: ReactNode }) {
  const { editMode, toggle, enable, fields, clearFields } = useEditMode();
  // The pencil only appears in the in-app editing context: the server passes
  // isOwner=true only when the owner opens the page with ?edit=1 (the chat
  // preview iframe). A direct /p/<slug> visit — the public/shared link — never
  // shows it, for anyone.
  const showEdit = isOwner;
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const router = useRouter();

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "SMART_PAGES_EDIT" && event.data.enabled) enable();
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [enable]);

  // Clicking ✓ auto-saves pending changes then reloads; clicking ✏ just enters edit mode
  async function handlePencilClick() {
    if (!editMode) { toggle(); return; }
    if (Object.keys(fields).length === 0) { toggle(); return; }
    setSaving(true);
    setSaveErr("");
    try {
      await commitPageEdits(page, fields);
      setSaving(false);
      clearFields();
      toggle();
      await new Promise((r) => setTimeout(r, 300));
      router.refresh();
    } catch (err) {
      setSaving(false);
      setSaveErr(err instanceof Error ? err.message : "Save failed. Try again.");
    }
  }

  return (
    <>
      {isDraft && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-400 text-amber-900 text-center text-sm py-1.5 font-medium pointer-events-none">
          Draft — not visible to the public.
        </div>
      )}
      {children}
      {showEdit && (
        <>
          {saveErr && editMode && (
            <div className="fixed bottom-20 right-6 z-50 bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg max-w-xs text-right">
              ⚠ {saveErr}
            </div>
          )}
          <button
            onClick={() => void handlePencilClick()}
            disabled={saving}
            title={editMode ? (saving ? "Saving…" : "Save & exit editing") : "Edit page"}
            className="fixed bottom-6 right-6 z-50 h-12 px-5 rounded-full shadow-xl flex items-center gap-2 text-white text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:scale-100"
            style={{ backgroundColor: editMode ? "#16a34a" : "#6366f1" }}
            aria-label={editMode ? "Save changes" : "Edit page"}
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : editMode ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Save changes
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Page
              </>
            )}
          </button>
        </>
      )}
    </>
  );
}

// Renders the wrapper div with EditBar inside it (sticky positioning requires it to be in the scroll container)
function PageShell({ page, className, style, children }: { page: PageSchema; className: string; style: React.CSSProperties; children: ReactNode }) {
  const { editMode } = useEditMode();
  return (
    <div className={className} style={style}>
      {editMode && <EditBar page={page} />}
      {children}
    </div>
  );
}

export function PageRenderer({ page, isPreview = false, isProtected = false, isDraft = false, isOwner = false }: PageRendererProps) {
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
      <WithEditPencil page={page} isProtected={isProtected} isDraft={isDraft} isOwner={isOwner}>
        <PageShell page={page} className={wrapper} style={brandStyle}>
          <CheckoutNav brand={brand} payment={payment} />
          <EditableSection label="hero"><LandingHero page={page} brand={brand} payment={payment} /></EditableSection>
          <div className="bg-white">
            {sections.map((section, idx) => (
              <SectionRenderer
                key={section.id}
                section={section}
                brand={brand}
                onCtaClick={() => document.getElementById("pay")?.scrollIntoView({ behavior: "smooth" })}
                razorpayKeyId={payment.razorpayKeyId}
                sectionIndex={idx}
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
        </PageShell>
      </WithEditPencil>
    );
  }

  // ── Collection page: multi-product grid with cart, always-on inline editing ──
  if (page.pageType === "collection") {
    return (
      <WithEditPencil page={page} isProtected={isProtected} isDraft={isDraft} isOwner={isOwner}>
        <CartProvider>
          <CollectionPageInner page={page} wrapper={wrapper} brandStyle={brandStyle} brand={brand} sections={sections} payment={payment} />
        </CartProvider>
      </WithEditPencil>
    );
  }

  // ── Default: checkout-optimised layout (sidebar payment card) ──
  const belowFoldTypes = new Set(["testimonials", "faq", "agenda", "speakers", "stats", "cta"]);
  const aboveSections = sections.filter((s) => !belowFoldTypes.has(s.type));
  const belowSections = sections.filter((s) => belowFoldTypes.has(s.type));

  return (
    <WithEditPencil page={page} isProtected={isProtected} isDraft={isDraft} isOwner={isOwner}>
      <PageShell page={page} className={wrapper} style={brandStyle}>
        <a href="#pay" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-white focus:text-gray-900 focus:rounded focus:shadow-lg focus:text-sm">
          Skip to payment
        </a>
        <CheckoutNav brand={brand} payment={payment} />
        <EditableSection label="hero"><CheckoutHero page={page} brand={brand} payment={payment} aboveSections={aboveSections} /></EditableSection>

        {belowSections.length > 0 && (
          <div className="bg-white">
            {belowSections.map((section) => (
              <SectionRenderer
                key={section.id}
                section={section}
                brand={brand}
                onCtaClick={() => {}}
                razorpayKeyId={payment.razorpayKeyId}
                sectionIndex={sections.indexOf(section)}
              />
            ))}
          </div>
        )}

        <CheckoutFooter brand={brand} />
      </PageShell>
    </WithEditPencil>
  );
}

// ─── Collection page inner (needs useEditMode hook) ──────────────
function CollectionPageInner({
  page, wrapper, brandStyle, brand, sections, payment,
}: {
  page: PageSchema;
  wrapper: string;
  brandStyle: React.CSSProperties;
  brand: Brand;
  sections: Section[];
  payment: Payment;
}) {
  return (
    <PageShell page={page} className={wrapper} style={brandStyle}>
      <CollectionNav brand={brand} />
      <EditableSection label="hero"><CollectionHero brand={brand} payment={payment} page={page} /></EditableSection>
      <div id="products" className="bg-white">
        {sections.map((section, idx) => (
          <SectionRenderer
            key={section.id}
            section={section}
            brand={brand}
            onCtaClick={() => {}}
            razorpayKeyId={payment.razorpayKeyId}
            sectionIndex={idx}
          />
        ))}
      </div>
      <CheckoutFooter brand={brand} />
      <CartDrawer brand={brand} razorpayKeyId={payment.razorpayKeyId} slug={page.slug} />
    </PageShell>
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
  const { editMode, fields, setField } = useEditMode();
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = fields["payment.name"] ?? payment.name;
  const displayDesc = fields["payment.description"] ?? payment.description;
  const displayImageUrl = fields["productImageUrl"] ?? page.productImageUrl;

  const bullets: string[] = (page.productBullets as string[] | undefined) ?? [];
  const featureSection = aboveSections.find((s) => s.type === "features" || s.type === "benefits");
  const derivedBullets =
    bullets.filter(Boolean).length > 0
      ? bullets.filter(Boolean)
      : (featureSection as { items?: Array<{ title: string }> } | undefined)
          ?.items?.slice(0, 6)
          .map((i) => i.title) ?? [];

  const trustSection = aboveSections.find((s) => s.type === "trust");
  const galleryImages = page.productImages && page.productImages.length > 1 ? page.productImages : null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("Image must be under 4 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setField("productImageUrl", dataUrl); // optimistic preview
      void uploadImage(dataUrl).then((url) => { if (url) setField("productImageUrl", url); });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <section className="py-8 md:py-12">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-0 lg:gap-px rounded-2xl overflow-hidden border border-black/[0.07] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)]">

          {/* LEFT: brand world */}
          <div
            className="p-6 md:p-8 flex flex-col gap-6"
            style={{ backgroundColor: `${brand.primaryColor}0c` }}
          >
            {/* Product visual */}
            {displayImageUrl ? (
              <div className="flex flex-col gap-2">
                <div
                  className={cn("rounded-xl overflow-hidden aspect-[4/3] shadow-sm bg-gray-50 flex items-center justify-center relative", editMode && "cursor-pointer group")}
                  onClick={() => editMode && fileRef.current?.click()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayImageUrl}
                    alt={displayName}
                    width={600}
                    height={450}
                    className="w-full h-full object-contain"
                    fetchPriority="high"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  {editMode && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg text-gray-700 text-xl">✏</div>
                    </div>
                  )}
                </div>
                {galleryImages && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {galleryImages.map((src, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={src}
                        alt={`${displayName} ${i + 1}`}
                        className="w-16 h-16 rounded-lg object-cover shrink-0 border-2 border-white shadow-sm"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className={cn(editMode && "cursor-pointer group relative")}
                onClick={() => editMode && fileRef.current?.click()}
              >
                <BrandedProductCard brand={brand} payment={payment} pageType={page.pageType} />
                {editMode && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg text-gray-700 text-xl">✏</div>
                  </div>
                )}
              </div>
            )}

            {/* Product name + price */}
            <div className="flex flex-col gap-1.5">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: `${brand.primaryColor}99` }}
              >
                {page.pageType}
              </p>
              {editMode ? (
                <input
                  value={displayName}
                  onChange={(e) => setField("payment.name", e.target.value)}
                  className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-full"
                />
              ) : (
                <h1
                  className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight tracking-tight"
                  style={{ textWrap: "balance" } as React.CSSProperties}
                >
                  {displayName}
                </h1>
              )}
              {editMode ? (
                <div className="flex items-center gap-0.5">
                  <span className="text-3xl font-extrabold" style={{ color: brand.primaryColor }}>
                    {payment.currency === "INR" ? "₹" : payment.currency === "USD" ? "$" : payment.currency === "EUR" ? "€" : payment.currency === "GBP" ? "£" : payment.currency}
                  </span>
                  <input
                    type="number"
                    value={paiseToRupeesInput(fields["payment.amount"] ?? String(payment.amount))}
                    onChange={(e) => setField("payment.amount", rupeesInputToPaise(e.target.value))}
                    min="0"
                    step="any"
                    placeholder="0"
                    className="text-3xl font-extrabold tabular-nums bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-28"
                    style={{ color: brand.primaryColor }}
                  />
                </div>
              ) : (
                payment.amount > 0 && (
                  <p
                    className="text-3xl font-extrabold tabular-nums"
                    style={{ color: brand.primaryColor }}
                    translate="no"
                  >
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                )
              )}
              {(displayDesc || editMode) && (
                editMode ? (
                  <textarea
                    value={displayDesc ?? ""}
                    onChange={(e) => setField("payment.description", e.target.value)}
                    placeholder="Add a product description…"
                    rows={3}
                    className="text-gray-500 text-sm leading-relaxed mt-1 bg-transparent border border-indigo-200 focus:border-indigo-400 outline-none rounded-lg p-2 w-full resize-none"
                  />
                ) : (
                  <p className="text-gray-500 text-sm leading-relaxed mt-1">{displayDesc}</p>
                )
              )}
            </div>

            {/* Feature bullets — Sweetgreen-inspired ingredient cards */}
            {derivedBullets.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {derivedBullets.map((b, i) => {
                  const hasBulletsInPage = ((page.productBullets as string[] | undefined) ?? []).filter(Boolean).length > 0;
                  return (
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
                      <span className="text-gray-700 text-xs leading-snug font-semibold flex-1 min-w-0">
                        {editMode && hasBulletsInPage ? (
                          <input
                            value={fields[`productBullets.${i}`] ?? b}
                            onChange={(e) => setField(`productBullets.${i}`, e.target.value)}
                            className="bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none w-full text-gray-700 text-xs font-semibold"
                          />
                        ) : b}
                      </span>
                    </div>
                  );
                })}
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
// The real Razorpay key, used for every checkout. No demo/test simulation.
const RZP_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";

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

    if (isFree) {
      // Confirm server-side that the page is actually free (and record it) —
      // don't trust a client-forced "free" on a paid page.
      try {
        const res = await fetch("/api/razorpay/free-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: page.slug, customerName: name, customerEmail: email, customerPhone: phone }),
        });
        if (!res.ok) {
          const { error: e } = await res.json().catch(() => ({ error: "" })) as { error?: string };
          setError(e || "Couldn't complete. Please try again.");
          setLoading(false);
          return;
        }
      } catch {
        setError("Couldn't complete. Please try again.");
        setLoading(false);
        return;
      }
      setLoading(false);
      setSuccess(true);
      return;
    }

    try {
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // amount is computed server-side from the page; we only pass the
          // coupon so the server can apply the (validated) discount.
          currency: payment.currency,
          receipt: `rcpt_${Date.now()}`,
          slug: page.slug,
          couponCode: couponApplied ? couponCode : undefined,
        }),
      });
      if (!orderRes.ok) {
        const { error: errMsg } = await orderRes.json() as { error?: string };
        throw new Error(errMsg || `Order creation failed (${orderRes.status})`);
      }
      const { orderId, keyId: orderKeyId, amount: orderAmount } = await orderRes.json() as { orderId: string; keyId?: string; amount?: number };

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
        key: orderKeyId || RZP_KEY || payment.razorpayKeyId,
        order_id: orderId,
        amount: orderAmount ?? effectiveAmount,
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
                slug: page.slug,
                amount: effectiveAmount,
                currency: payment.currency,
                customerName: name,
                customerEmail: email,
                customerPhone: phone,
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
        {page.averageRating !== undefined && (
          <div className="flex items-center gap-1.5 mt-3" aria-label={`${page.averageRating.toFixed(1)} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <svg key={i} className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                style={{ color: i <= Math.round(page.averageRating!) ? brand.primaryColor : "#e5e7eb" }}>
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className="text-sm text-gray-400 ml-0.5">
              {page.averageRating.toFixed(1)}
              {page.reviewCount !== undefined && <span className="text-gray-300"> ({page.reviewCount})</span>}
            </span>
          </div>
        )}
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
        {!isFree && (
          <p className="text-xs text-gray-400 mt-1">Secured payments with UPI, Cards &amp; Wallets</p>
        )}
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
                  <span>Opening checkout…</span>
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
function BrandedProductCard({ brand, payment, pageType }: { brand: Brand; payment: Payment; pageType: string }) {
  const primary = brand.primaryColor || "#6366f1";
  const deep = darken(primary, 0.22);
  const emoji = inferProductEmoji(payment.name, pageType);
  const formattedPrice = formatCurrency(payment.amount, payment.currency);
  const [imgFailed, setImgFailed] = useState(false);
  const imageUrl = generatedImageUrl(productImagePrompt(payment.name, brand.name, payment.description), {
    width: 800, height: 600, seedKey: `${brand.name}:${payment.name}`,
  });

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

      {/* Real generated image — covers the gradient+emoji once it loads */}
      {!imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={payment.name}
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}

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
  const { editMode, fields, setField } = useEditMode();
  const fileRef = useRef<HTMLInputElement>(null);

  const heroSection = page.sections.find((s) => s.type === "hero");
  const badge = heroSection?.type === "hero" ? heroSection.badge : undefined;
  const urgency = heroSection?.type === "hero" ? heroSection.urgency : undefined;

  const displayName = fields["payment.name"] ?? payment.name;
  const displayDesc = fields["payment.description"] ?? payment.description;
  const displayImageUrl = fields["productImageUrl"] ?? page.productImageUrl;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("Image must be under 4 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setField("productImageUrl", dataUrl); // optimistic preview
      void uploadImage(dataUrl).then((url) => { if (url) setField("productImageUrl", url); });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <section
      className="py-20 md:py-28 text-center relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${brand.primaryColor}18 0%, transparent 70%), #fff`,
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
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
        {displayImageUrl && (
          <div
            className={cn("relative inline-block mx-auto mb-6", editMode && "cursor-pointer group")}
            onClick={() => editMode && fileRef.current?.click()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayImageUrl} alt={displayName} className="max-h-64 mx-auto rounded-2xl shadow-lg object-contain" />
            {editMode && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg text-gray-700 text-xl">✏</div>
              </div>
            )}
          </div>
        )}
        {!displayImageUrl && editMode && (
          <button
            onClick={() => fileRef.current?.click()}
            className="mx-auto mb-6 flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-400 text-sm hover:border-indigo-500 hover:text-indigo-600 transition-colors"
          >
            <span>+</span> Add product image
          </button>
        )}
        {editMode ? (
          <input
            value={displayName}
            onChange={(e) => setField("payment.name", e.target.value)}
            className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-[1.05] tracking-tight mb-6 bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none text-center w-full"
          />
        ) : (
          <h1
            className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-[1.05] tracking-tight mb-6"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            {displayName}
          </h1>
        )}
        {(displayDesc || editMode) && (
          editMode ? (
            <textarea
              value={displayDesc ?? ""}
              onChange={(e) => setField("payment.description", e.target.value)}
              placeholder="Add a description…"
              rows={2}
              className="text-xl text-gray-500 leading-relaxed mb-8 max-w-2xl mx-auto bg-transparent border border-indigo-200 focus:border-indigo-400 outline-none rounded-lg p-2 w-full resize-none text-center"
            />
          ) : (
            <p className="text-xl text-gray-500 leading-relaxed mb-8 max-w-2xl mx-auto">{displayDesc}</p>
          )
        )}
        {editMode ? (
          <div className="flex items-center justify-center gap-0.5 mb-8">
            <span className="text-4xl font-extrabold" style={{ color: brand.primaryColor }}>
              {payment.currency === "INR" ? "₹" : payment.currency === "USD" ? "$" : payment.currency === "EUR" ? "€" : payment.currency === "GBP" ? "£" : payment.currency}
            </span>
            <input
              type="number"
              value={paiseToRupeesInput(fields["payment.amount"] ?? String(payment.amount))}
              onChange={(e) => setField("payment.amount", rupeesInputToPaise(e.target.value))}
              min="0"
              step="any"
              placeholder="0"
              className="text-4xl font-extrabold tabular-nums bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-36 text-center"
              style={{ color: brand.primaryColor }}
            />
          </div>
        ) : (
          payment.amount > 0 && (
            <p className="text-4xl font-extrabold mb-8 tabular-nums" style={{ color: brand.primaryColor }} translate="no">
              {formatCurrency(payment.amount, payment.currency)}
            </p>
          )
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

// ─── Collection nav (sticky, with cart button) ───────────────────
function CollectionNav({ brand }: { brand: Brand }) {
  const { count, open } = useCart();
  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-black/[0.07] sticky top-0 z-40">
      <div className="container mx-auto px-5 max-w-6xl h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo} alt={brand.name} className="h-7 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shrink-0" style={{ backgroundColor: brand.primaryColor }}>
              {brand.name[0]}
            </div>
          )}
          <span className="font-bold text-gray-900 text-sm tracking-tight truncate">{brand.name}</span>
        </div>
        <button
          onClick={open}
          className="relative flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-all hover:shadow-md"
          style={{ borderColor: brand.primaryColor, color: brand.primaryColor }}
          aria-label={`Open cart, ${count} item${count !== 1 ? "s" : ""}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          {count > 0 ? `Bag (${count})` : "Bag"}
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center" style={{ backgroundColor: brand.primaryColor }}>
              {count}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

// ─── Edit mode floating bar ───────────────────────────────────────
function EditBar({ page }: { page: PageSchema }) {
  const { fields, saving, setSaving, saveError, setSaveError, toggle, clearFields } = useEditMode();
  const hasChanges = Object.keys(fields).length > 0;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const router = useRouter();

  // skipRefresh = true when called from the Publish postMessage flow (parent needs the reply)
  async function handleSave(skipRefresh = false): Promise<void> {
    setSaving(true);
    setSaveError("");
    try {
      await commitPageEdits(page, fieldsRef.current);
      if (!skipRefresh) { clearFields(); toggle(); await new Promise((r) => setTimeout(r, 300)); router.refresh(); }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  // Listen for Publish flow requesting a save before the URL goes live
  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "SMART_PAGES_SAVE") return;
      let success = true;
      if (Object.keys(fieldsRef.current).length > 0) {
        try { await handleSave(true); } catch { success = false; }
      }
      window.parent.postMessage({ type: "SMART_PAGES_SAVE_DONE", success }, window.location.origin);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.slug]);


  return (
    <div className="sticky top-0 z-50 bg-indigo-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-lg">✏</span>
        <span className="font-semibold">Edit mode</span>
        {hasChanges && <span className="text-indigo-200 text-xs">· {Object.keys(fields).length} unsaved change{Object.keys(fields).length > 1 ? "s" : ""}</span>}
      </div>
      <div className="flex items-center gap-2">
        {saveError && <span className="text-red-300 text-xs">{saveError}</span>}
        <button
          onClick={() => {
            if (hasChanges && !window.confirm("Discard unsaved changes?")) return;
            clearFields();
            toggle();
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges}
          className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Collection page hero (full-width gradient banner) ────────────
function CollectionHero({ brand, payment, page }: { brand: Brand; payment: Payment; page: PageSchema }) {
  const { editMode, fields, setField } = useEditMode();
  const heroName = fields["brand.name"] ?? brand.name;
  const heroDesc = fields["payment.description"] ?? payment.description;
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  // Real image behind the banner: the creator's upload, or an AI-generated one
  // (Pollinations) from the brand context when they haven't provided a photo.
  const generatedHero = generatedImageUrl(heroImagePrompt(brand.name, payment.description), {
    width: 1280, height: 640, seedKey: `hero:${brand.name}`,
  });
  const bannerImage = page.productImageUrl ?? (heroImgFailed ? null : generatedHero);

  return (
    <section
      className="relative py-16 md:py-24 text-center overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${brand.primaryColor} 0%, ${brand.secondaryColor ?? "#0f172a"} 100%)`,
      }}
    >
      {/* Real image behind the banner */}
      {bannerImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bannerImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setHeroImgFailed(true)}
        />
      )}
      {/* Brand scrim over the photo so the white headline stays legible */}
      {bannerImage && (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${brand.primaryColor}73 0%, ${darken(brand.primaryColor, 0.45)}c2 100%)` }}
        />
      )}
      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

      <div className="relative container mx-auto px-4 max-w-3xl">
        {brand.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt={brand.name} className="h-10 mx-auto mb-6 object-contain" />
        )}
        {editMode ? (
          <input
            value={heroName}
            onChange={(e) => setField("brand.name", e.target.value)}
            className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight mb-4 bg-transparent border-b-2 border-white/50 focus:border-white outline-none text-center w-full"
          />
        ) : (
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight mb-4">
            {heroName}
          </h1>
        )}
        {(heroDesc || editMode) && (
          editMode ? (
            <textarea
              value={heroDesc ?? ""}
              onChange={(e) => setField("payment.description", e.target.value)}
              placeholder="Add a tagline…"
              rows={2}
              className="text-lg text-white/80 leading-relaxed mb-8 max-w-xl mx-auto bg-transparent border-b border-white/30 focus:border-white/70 outline-none text-center w-full resize-none"
            />
          ) : (
            <p className="text-lg text-white/80 leading-relaxed mb-8 max-w-xl mx-auto">{heroDesc}</p>
          )
        )}
        <a
          href="#products"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-bold text-base transition-all hover:scale-105 bg-white"
          style={{ color: brand.primaryColor }}
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
