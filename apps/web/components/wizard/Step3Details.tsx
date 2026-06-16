"use client";

import { useEffect, useRef, useState } from "react";
import type { WizardInput, PageType, CollectionProductInput } from "@/lib/schema/page-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Step3DetailsProps {
  input: Partial<WizardInput>;
  onUpdate: (updates: Partial<WizardInput>) => void;
  onNext: () => void;
  onBack: () => void;
}

const PAGE_TYPES: { type: PageType; emoji: string; label: string; description: string }[] = [
  { type: "product",      emoji: "📦", label: "Product",       description: "Physical or digital product with checkout" },
  { type: "service",      emoji: "🛠️", label: "Service",       description: "Done-for-you service or deliverable" },
  { type: "course",       emoji: "📚", label: "Course",        description: "Online course or learning programme" },
  { type: "workshop",     emoji: "🎓", label: "Workshop",      description: "Live in-person or virtual training" },
  { type: "event",        emoji: "🎤", label: "Event",         description: "Conference, meetup, or concert" },
  { type: "consultation", emoji: "💼", label: "1:1 Session",   description: "Coaching, consulting, or advisory call" },
  { type: "saas",         emoji: "⚡", label: "SaaS",          description: "Software or app subscription" },
  { type: "subscription", emoji: "♾️", label: "Membership",    description: "Recurring membership or subscription" },
  { type: "landing",      emoji: "🚀", label: "Landing Page",  description: "Full persuasion funnel for paid ads & cold traffic" },
  { type: "collection",   emoji: "🛍️", label: "Collection",    description: "Multiple products — each with its own buy button" },
];

interface ProductExtract {
  name?: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: string;
  brand?: string;
  primaryColor?: string;
  logo?: string;
  bullets?: string[];
}

function isUrl(s: string) {
  try { new URL(s.startsWith("http") ? s : `https://${s}`); return true; } catch { return false; }
}

export function Step3Details({ input, onUpdate, onNext, onBack }: Step3DetailsProps) {
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ProductExtract | null>(null);
  const [extractError, setExtractError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bullets: string[] = Array.isArray(input.productBullets) && input.productBullets.length === 3
    ? input.productBullets as string[]
    : ["", "", ""];

  function setBullet(i: number, val: string) {
    const next = [...bullets];
    next[i] = val;
    onUpdate({ ...input, productBullets: next });
  }

  function set<K extends keyof WizardInput>(key: K, value: WizardInput[K]) {
    onUpdate({ ...input, [key]: value });
  }

  // Auto-extract whenever productUrl changes (debounced 800ms)
  useEffect(() => {
    const url = input.productUrl?.trim() ?? "";
    if (!url || !isUrl(url)) { setExtracted(null); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runExtract(url);
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.productUrl]);

  async function runExtract(url: string) {
    setExtracting(true);
    setExtractError("");
    try {
      const normalized = url.startsWith("http") ? url : `https://${url}`;
      const res = await fetch(`/api/extract?url=${encodeURIComponent(normalized)}`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as ProductExtract;
      setExtracted(data);

      // Auto-fill fields that are still empty
      const currentBullets: string[] = Array.isArray(input.productBullets)
        ? (input.productBullets as string[])
        : [];
      const bulletsAreEmpty = currentBullets.every((b) => !b?.trim());
      const newBullets =
        bulletsAreEmpty && data.bullets && data.bullets.length > 0
          ? [...data.bullets.slice(0, 3), "", ""].slice(0, 3)
          : currentBullets;

      onUpdate({
        ...input,
        productUrl: url,
        productImageUrl: input.productImageUrl || data.imageUrl || data.images?.[0] || "",
        productName: input.productName || data.name || "",
        productDescription: input.productDescription || data.description || "",
        productBullets: newBullets,
        brand: {
          ...input.brand,
          primaryColor: input.brand?.primaryColor || data.primaryColor,
          logo: input.brand?.logo || data.logo,
        },
      });
    } catch {
      setExtractError("Couldn't pull product details from that URL. Fill in the fields below manually.");
    } finally {
      setExtracting(false);
    }
  }

  const isCollection = input.pageType === "collection";
  const collectionProducts: CollectionProductInput[] =
    (input.collectionProducts as CollectionProductInput[] | undefined) ?? [];

  function addCollectionProduct() {
    onUpdate({
      ...input,
      collectionProducts: [
        ...collectionProducts,
        { name: "", price: 0, description: "", imageUrl: "" },
      ],
    });
  }

  function updateCollectionProduct(i: number, updates: Partial<CollectionProductInput>) {
    const next = collectionProducts.map((p, idx) => idx === i ? { ...p, ...updates } : p);
    onUpdate({ ...input, collectionProducts: next });
  }

  function removeCollectionProduct(i: number) {
    onUpdate({ ...input, collectionProducts: collectionProducts.filter((_, idx) => idx !== i) });
  }

  const canProceed = !!input.pageType && (
    isCollection
      ? collectionProducts.length >= 2 && collectionProducts.every((p) => p.name.trim() && p.price > 0)
      : !!input.productName?.trim() && bullets.some((b) => b.trim().length > 0)
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">What do you want to feature?</h2>
        <p className="text-gray-500">
          Paste your product or collection URL — we'll pull the name, image, and description automatically.
        </p>
      </div>

      <div className="flex flex-col gap-5">

        {/* Product URL — auto-extracts on paste */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Product or collection URL
          </label>
          <div className="relative">
            <Input
              value={input.productUrl || ""}
              onChange={(e) => set("productUrl", e.target.value)}
              placeholder="https://yourstore.com/products/item"
              className="h-11 rounded-xl pr-10"
            />
            {extracting && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </span>
            )}
          </div>
          {extractError && <p className="text-xs text-red-500 mt-1.5">{extractError}</p>}

          {/* Auto-extracted product card */}
          {extracted && !extracting && (extracted.imageUrl || extracted.name) && (
            <div className="mt-4 flex gap-3 p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
              {extracted.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={extracted.imageUrl}
                  alt="product"
                  className="w-16 h-16 rounded-xl object-cover shrink-0 bg-white"
                  onError={(e) => e.currentTarget.remove()}
                />
              )}
              <div className="flex flex-col justify-center min-w-0">
                {extracted.name && (
                  <p className="text-sm font-semibold text-gray-900 truncate">{extracted.name}</p>
                )}
                {extracted.price && (
                  <p className="text-sm text-indigo-600 font-medium">{extracted.price}</p>
                )}
                {extracted.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{extracted.description}</p>
                )}
                <p className="text-xs text-indigo-500 mt-1 font-medium">✓ Details auto-filled below</p>
              </div>
            </div>
          )}

          {/* Image picker if multiple found */}
          {extracted?.images && extracted.images.length > 1 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Pick the best image:</p>
              <div className="flex gap-2 flex-wrap">
                {extracted.images.slice(0, 5).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={img}
                    alt=""
                    onClick={() => set("productImageUrl", img)}
                    className={cn(
                      "w-14 h-14 rounded-xl object-cover cursor-pointer border-2 transition-all",
                      input.productImageUrl === img
                        ? "border-indigo-500 ring-2 ring-indigo-200"
                        : "border-gray-200 hover:border-indigo-300"
                    )}
                    onError={(e) => e.currentTarget.remove()}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Product name + type */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Product / offering name *
            </label>
            <Input
              value={input.productName || ""}
              onChange={(e) => set("productName", e.target.value)}
              placeholder="e.g. AirPods Pro, Brand Strategy Session"
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PAGE_TYPES.map((pt) => (
                <button
                  key={pt.type}
                  onClick={() => set("pageType", pt.type)}
                  title={pt.description}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 rounded-2xl border-2 text-xs font-semibold transition-all",
                    input.pageType === pt.type
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-100 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <span className="text-xl">{pt.emoji}</span>
                  {pt.label}
                </button>
              ))}
            </div>
            {input.pageType === "landing" && (
              <p className="text-xs text-indigo-600 mt-2 bg-indigo-50 px-3 py-2 rounded-xl">
                🚀 Full persuasion funnel — hero, features, benefits, testimonials, stats, and FAQ — with payment anchored at the bottom. Best for cold traffic from ads.
              </p>
            )}
            {input.pageType === "collection" && (
              <p className="text-xs text-indigo-600 mt-2 bg-indigo-50 px-3 py-2 rounded-xl">
                🛍️ Shows multiple products each with their own buy button. Add at least 2 products below.
              </p>
            )}
          </div>
        </div>

        {/* ── Collection: multi-product editor ── */}
        {isCollection && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Products *</p>
                <p className="text-xs text-gray-400">Add 2–8 products. Each gets its own buy button.</p>
              </div>
              {collectionProducts.length < 8 && (
                <button
                  type="button"
                  onClick={addCollectionProduct}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                >
                  + Add product
                </button>
              )}
            </div>

            {collectionProducts.length === 0 && (
              <button
                type="button"
                onClick={addCollectionProduct}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
              >
                + Add your first product
              </button>
            )}

            {collectionProducts.map((product, i) => (
              <div key={i} className="border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Product {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeCollectionProduct(i)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
                    <Input
                      value={product.name}
                      onChange={(e) => updateCollectionProduct(i, { name: e.target.value })}
                      placeholder="e.g. Chocolate Truffle Cake"
                      className="h-9 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Price (₹) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <Input
                        type="number"
                        value={product.price ? (product.price / 100).toString() : ""}
                        onChange={(e) => updateCollectionProduct(i, { price: Math.round(parseFloat(e.target.value || "0") * 100) })}
                        placeholder="499"
                        className="h-9 rounded-xl pl-6 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Badge</label>
                    <Input
                      value={product.badge ?? ""}
                      onChange={(e) => updateCollectionProduct(i, { badge: e.target.value })}
                      placeholder="Best Seller"
                      className="h-9 rounded-xl text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                    <Input
                      value={product.description ?? ""}
                      onChange={(e) => updateCollectionProduct(i, { description: e.target.value })}
                      placeholder="One-line description"
                      className="h-9 rounded-xl text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Image URL</label>
                    <Input
                      value={product.imageUrl ?? ""}
                      onChange={(e) => updateCollectionProduct(i, { imageUrl: e.target.value })}
                      placeholder="https://yoursite.com/image.jpg"
                      className="h-9 rounded-xl text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3 key selling points — shown on checkout page */}
        {/* Single-product fields (hidden for collection pages) */}
        {!isCollection && (<>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-0.5">
              3 reasons to buy *
            </label>
            <p className="text-xs text-gray-400 mb-3">
              These appear next to the payment form. Keep each under 10 words.
            </p>
            <div className="flex flex-col gap-2.5">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-indigo-600"
                    style={{ backgroundColor: "#e0e7ff" }}
                  >
                    {i + 1}
                  </span>
                  <Input
                    value={b}
                    onChange={(e) => setBullet(i, e.target.value)}
                    placeholder={
                      i === 0 ? "Instant access, no waiting" :
                      i === 1 ? "30-day money-back guarantee" :
                                 "1:1 onboarding call included"
                    }
                    className="h-10 rounded-xl"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Price */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Price (₹)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
              <Input
                type="number"
                value={input.price ? (input.price / 100).toString() : ""}
                onChange={(e) =>
                  set("price", Math.round(parseFloat(e.target.value || "0") * 100))
                }
                placeholder={
                  extracted?.price
                    ? extracted.price.replace(/[^0-9.]/g, "")
                    : "4999"
                }
                className="h-11 rounded-xl pl-8"
              />
            </div>
            {extracted?.price && !input.price && (
              <p className="text-xs text-indigo-500 mt-1">
                Detected price: {extracted.price} — enter it above to use it.
              </p>
            )}
          </div>
        </>)}

        {/* AI context (always shown) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Description <span className="text-gray-400 font-normal">(for AI — not shown on page)</span>
          </label>
          <textarea
            value={input.productDescription || ""}
            onChange={(e) => set("productDescription", e.target.value)}
            placeholder={isCollection
              ? "Describe your brand or collection for the AI — e.g. what you make, your style"
              : "What exactly does the customer get? Who is it for?"}
            rows={2}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 rounded-xl">
          ← Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
        >
          {isCollection
            ? `Generate collection page (${collectionProducts.length} products) →`
            : input.pageType === "landing"
            ? "Generate landing page →"
            : "Generate checkout page →"}
        </Button>
      </div>
    </div>
  );
}
