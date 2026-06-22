"use client";

import { useState } from "react";
import { inferProductEmoji, darken } from "@/lib/product-visual";
import { generatedImageUrl, productImagePrompt } from "@/lib/image-gen";

// An auto-generated product visual shown when the creator hasn't uploaded a
// photo. Renders a real AI-generated image (Pollinations) for the product,
// layered over a branded gradient + emoji that shows instantly while the image
// loads and remains as the fallback if generation fails.
export function GeneratedProductBanner({
  brand,
  name,
  description,
  pageType = "product",
}: {
  brand: { name: string; primaryColor: string; secondaryColor?: string };
  name: string;
  description?: string;
  pageType?: string;
}) {
  const primary = brand.primaryColor || "#6366f1";
  const deep = darken(primary, 0.3);
  const emoji = inferProductEmoji(name, pageType);
  const [imgFailed, setImgFailed] = useState(false);

  const imageUrl = generatedImageUrl(productImagePrompt(name, brand.name, description), {
    width: 600,
    height: 450,
    seedKey: `${brand.name}:${name}`,
  });

  return (
    <div
      className="w-full h-full relative overflow-hidden select-none"
      role="img"
      aria-label={`${name} visual`}
      style={{
        background: `
          radial-gradient(ellipse 90% 60% at 72% 12%, ${primary}55 0%, transparent 62%),
          radial-gradient(ellipse 70% 80% at 8% 92%, ${primary}33 0%, transparent 55%),
          linear-gradient(150deg, ${deep} 0%, ${darken(primary, 0.12)} 100%)
        `,
      }}
    >
      {/* Branded fallback layer (grain + emoji + watermark) — visible while the
          image loads and if it fails. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.06 }}
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id={`grain-${primary.replace("#", "")}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${primary.replace("#", "")})`} />
      </svg>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 leading-none"
        style={{ fontSize: "clamp(40px, 28%, 88px)", filter: `drop-shadow(0 8px 22px ${primary}66)` }}
        aria-hidden="true"
      >
        {emoji}
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 z-10">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center text-white font-extrabold text-[10px] shrink-0"
          style={{ backgroundColor: primary }}
          aria-hidden="true"
        >
          {brand.name?.[0]?.toUpperCase() ?? "•"}
        </div>
        <span className="text-white/70 text-[11px] font-semibold tracking-wide drop-shadow">{brand.name}</span>
      </div>

      {/* Real generated image — covers the fallback once it loads. */}
      {!imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}

      {/* Bottom accent line (kept above the image) */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] z-10"
        style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }}
        aria-hidden="true"
      />
    </div>
  );
}
