"use client";

import { useState } from "react";
import type { ProductGridSection, Brand, ProductGridItem } from "@/lib/schema/page-schema";
import { formatCurrency, cn } from "@/lib/utils";
import { useCart } from "@/components/cart/CartContext";

interface ProductGridBlockProps {
  section: ProductGridSection;
  brand: Brand;
  razorpayKeyId: string;
}

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
}: {
  item: ProductGridItem;
  brand: Brand;
  razorpayKeyId: string;
}) {
  const { add, items } = useCart();
  const [flash, setFlash] = useState(false);

  const currency = item.currency ?? "INR";
  const formatted = item.price > 0
    ? item.maxPrice && item.maxPrice > item.price
      ? `${formatCurrency(item.price, currency)} – ${formatCurrency(item.maxPrice, currency)}`
      : formatCurrency(item.price, currency)
    : "Free";

  const cartQty = items.find((i) => i.id === item.id)?.quantity ?? 0;

  function handleAdd() {
    add({ id: item.id, name: item.name, price: item.price, currency, imageUrl: item.imageUrl });
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
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
        {/* Cart quantity badge */}
        {cartQty > 0 && (
          <span
            className="absolute top-3 right-3 w-6 h-6 rounded-full text-white text-xs font-extrabold flex items-center justify-center shadow"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {cartQty}
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

        <div className="mt-auto pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-2xl font-extrabold tabular-nums"
              style={{ color: brand.primaryColor }}
              translate="no"
            >
              {formatted}
            </span>
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
            {flash ? "✓ Added!" : cartQty > 0 ? `In bag (${cartQty}) · Add more` : (item.price > 0 ? "Add to Bag" : "Get Free")}
          </button>
        </div>
      </div>
    </div>
  );
}

