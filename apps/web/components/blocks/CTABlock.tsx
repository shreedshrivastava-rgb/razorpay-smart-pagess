"use client";

import type { CTASection, Brand } from "@/lib/schema/page-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface CTABlockProps {
  section: CTASection;
  brand: Brand;
  onCtaClick?: () => void;
  sectionIndex?: number;
}

export function CTABlock({ section, brand, onCtaClick, sectionIndex }: CTABlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const isLight = section.background === "white" || section.background === "light";
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  function val(key: string, fallback: string) { return (pfx ? ctx?.fields[`${pfx}.${key}`] : undefined) ?? fallback; }
  function set(key: string, value: string) { if (pfx) ctx?.setField(`${pfx}.${key}`, value); }

  const headline = val("headline", section.headline);
  const subheadline = val("subheadline", section.subheadline ?? "");
  const ctaText = val("ctaText", section.ctaText);

  const inputBase = cn("bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-full text-center",
    isLight ? "text-gray-900" : "text-white");

  return (
    <section
      className="py-20 relative overflow-hidden"
      style={
        section.background === "brand"
          ? ({ backgroundColor: brand.primaryColor, "--brand-primary": brand.primaryColor } as React.CSSProperties)
          : section.background === "gradient"
            ? ({ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})`, "--brand-primary": brand.primaryColor } as React.CSSProperties)
            : section.background === "dark"
              ? { backgroundColor: "#030712" }
              : { backgroundColor: "#f9fafb" }
      }
    >
      {!isLight && (
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)`, backgroundSize: "30px 30px" }} />
      )}

      <div className="relative container mx-auto px-4 max-w-4xl text-center">
        {section.offer && (
          <span className={cn("inline-block mb-4 px-4 py-1 rounded-full text-sm font-semibold", isLight ? "bg-amber-100 text-amber-800" : "bg-white/20 text-white")}>
            🎁 {section.offer}
          </span>
        )}

        {editMode && pfx ? (
          <input value={headline} onChange={(e) => set("headline", e.target.value)}
            className={cn("text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4 block", inputBase)} />
        ) : (
          <h2 className={cn("text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-4", isLight ? "text-gray-900" : "text-white")}>{headline}</h2>
        )}

        {(subheadline || (editMode && pfx)) && (
          editMode && pfx ? (
            <textarea value={subheadline} onChange={(e) => set("subheadline", e.target.value)} rows={2}
              className={cn("text-lg md:text-xl mb-8 max-w-2xl mx-auto block resize-none", inputBase)} />
          ) : (
            <p className={cn("text-lg md:text-xl mb-8 max-w-2xl mx-auto", isLight ? "text-gray-600" : "text-white/80")}>{subheadline}</p>
          )
        )}

        {editMode && pfx ? (
          <input value={ctaText} onChange={(e) => set("ctaText", e.target.value)}
            className={cn("px-6 py-3 rounded-lg font-semibold shadow-xl inline-block", inputBase)} />
        ) : (
          <Button size="xl" onClick={onCtaClick} className="shadow-xl hover:scale-105 transition-transform"
            style={{ backgroundColor: isLight ? brand.primaryColor : "white", color: isLight ? "white" : brand.primaryColor }}>
            {ctaText}
          </Button>
        )}

        {section.urgency && (
          <p className={cn("mt-4 text-sm font-medium", isLight ? "text-orange-600" : "text-white/70")}>⏰ {section.urgency}</p>
        )}
      </div>
    </section>
  );
}
