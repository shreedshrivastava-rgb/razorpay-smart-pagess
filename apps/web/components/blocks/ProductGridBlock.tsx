"use client";

import { useRef, useState } from "react";
import type { ProductGridSection, Brand, ProductGridItem } from "@/lib/schema/page-schema";
import { formatCurrency, cn } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";
import { useEditModeOptional } from "@/components/editor/EditModeContext";
import { GeneratedProductBanner } from "./GeneratedProductBanner";

interface ProductGridBlockProps {
  section: ProductGridSection;
  brand: Brand;
  razorpayKeyId: string;
  sectionIndex?: number;
}

export function ProductGridBlock({ section, brand, razorpayKeyId, sectionIndex }: ProductGridBlockProps) {
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
          {section.items.map((item, itemIndex) => (
            <ProductCard
              key={item.id}
              item={item}
              brand={brand}
              razorpayKeyId={razorpayKeyId}
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
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
  sectionIndex,
  itemIndex,
}: {
  item: ProductGridItem;
  brand: Brand;
  razorpayKeyId: string;
  sectionIndex?: number;
  itemIndex: number;
}) {
  const { add, items } = useCart();
  const [flash, setFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editCtx = useEditModeOptional();
  const editMode = editCtx?.editMode ?? false;
  const fields = editCtx?.fields ?? {};
  const setField = editCtx?.setField;

  const basePath = sectionIndex !== undefined
    ? `sections.${sectionIndex}.items.${itemIndex}`
    : null;

  function field(key: string, fallback: string | undefined) {
    if (!basePath) return fallback;
    return fields[`${basePath}.${key}`] ?? fallback;
  }

  const currency = item.currency ?? "INR";
  const displayName = field("name", item.name) ?? item.name;
  const displayDesc = field("description", item.description);
  const displayImageUrl = field("imageUrl", item.imageUrl);
  const rawPrice = field("price", String(item.price));
  const displayPrice = isNaN(Number(rawPrice)) ? item.price : Number(rawPrice);

  const formatted = displayPrice > 0
    ? item.maxPrice && item.maxPrice > displayPrice
      ? `${formatCurrency(displayPrice, currency)} – ${formatCurrency(item.maxPrice, currency)}`
      : formatCurrency(displayPrice, currency)
    : "Free";

  const cartQty = items.find((i) => i.id === item.id)?.quantity ?? 0;

  function handleAdd() {
    add({ id: item.id, name: displayName, price: displayPrice, currency, imageUrl: displayImageUrl });
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  }

  function handleImageClick() {
    if (editMode && basePath && setField) fileRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !basePath || !setField) return;
    if (file.size > 4 * 1024 * 1024) { alert("Image must be under 4 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setField(`${basePath}.imageUrl`, reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Product image */}
      <div
        className={cn("aspect-[4/3] bg-gray-50 relative overflow-hidden", editMode && "cursor-pointer group")}
        onClick={handleImageClick}
      >
        {displayImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayImageUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <GeneratedProductBanner brand={brand} name={displayName} description={displayDesc} pageType="product" />
        )}

        {/* Edit overlay — only visible to page creator in edit mode */}
        {editMode && basePath && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg text-gray-700 text-xl">
              ✏
            </div>
          </div>
        )}
        {/* Always-visible pencil badge when no image */}
        {editMode && basePath && !displayImageUrl && (
          <div className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center text-base" style={{ color: brand.primaryColor }}>
            ✏
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
        {cartQty > 0 && (
          <span
            className="absolute top-3 right-3 w-6 h-6 rounded-full text-white text-xs font-extrabold flex items-center justify-center shadow"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {cartQty}
          </span>
        )}

        {/* Hidden file input */}
        {editMode && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        )}
      </div>

      {/* Details */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div>
          {editMode && basePath && setField ? (
            <input
              value={displayName}
              onChange={(e) => setField(`${basePath}.name`, e.target.value)}
              className="font-bold text-gray-900 text-lg leading-snug w-full bg-transparent border-b border-dashed border-gray-300 focus:border-gray-600 outline-none"
              placeholder="Product name"
            />
          ) : (
            <h3 className="font-bold text-gray-900 text-lg leading-snug">{displayName}</h3>
          )}
          {editMode && basePath && setField ? (
            <textarea
              value={displayDesc ?? ""}
              onChange={(e) => setField(`${basePath}.description`, e.target.value)}
              rows={2}
              className="text-gray-500 text-sm mt-1 leading-relaxed w-full bg-transparent border-b border-dashed border-gray-300 focus:border-gray-600 outline-none resize-none"
              placeholder="Add a description…"
            />
          ) : (
            displayDesc && (
              <p className="text-gray-500 text-sm mt-1 leading-relaxed">{displayDesc}</p>
            )
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

        <div className="mt-auto pt-2 space-y-2">
          <div className="flex items-center justify-between">
            {editMode && basePath && setField ? (
              <div className="flex items-center gap-1">
                <span className="text-xl font-extrabold" style={{ color: brand.primaryColor }}>₹</span>
                <input
                  type="number"
                  value={rawPrice ?? ""}
                  onChange={(e) => setField(`${basePath}.price`, e.target.value)}
                  className="text-2xl font-extrabold tabular-nums w-28 bg-transparent border-b border-dashed border-gray-300 focus:border-gray-600 outline-none"
                  style={{ color: brand.primaryColor }}
                  min={0}
                  placeholder="0"
                />
              </div>
            ) : (
              <span
                className="text-2xl font-extrabold tabular-nums"
                style={{ color: brand.primaryColor }}
                translate="no"
              >
                {formatted}
              </span>
            )}
          </div>
          <button
            onClick={handleAdd}
            className="w-full py-2.5 rounded-full text-sm font-bold transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2"
            style={flash
              ? { backgroundColor: "#16a34a", color: "#fff" }
              : cartQty > 0
                ? { backgroundColor: `${brand.primaryColor}15`, color: brand.primaryColor, border: `1.5px solid ${brand.primaryColor}` }
                : { backgroundColor: brand.primaryColor, color: "#fff" }
            }
          >
            {flash ? "✓ Added!" : cartQty > 0 ? `In bag (${cartQty}) · Add more` : (displayPrice > 0 ? "Add to Bag" : "Get Free")}
          </button>
        </div>
      </div>
    </div>
  );
}
