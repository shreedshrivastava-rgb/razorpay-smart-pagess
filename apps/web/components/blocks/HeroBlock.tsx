"use client";

import { Button } from "@/components/ui/button";
import type { HeroSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface HeroBlockProps {
  section: HeroSection;
  brand: Brand;
  onCtaClick?: () => void;
  sectionIndex?: number;
}

const backgroundStyles: Record<string, string> = {
  gradient: "bg-gradient-to-br from-[var(--brand-primary,#6366f1)] via-[color-mix(in_srgb,var(--brand-primary,#6366f1)_70%,black)] to-[var(--brand-secondary,#0f172a)] text-white",
  brand: "bg-[var(--brand-primary,#6366f1)] text-white",
  dark: "bg-gray-950 text-white",
  light: "bg-gray-50 text-gray-900",
  white: "bg-white text-gray-900",
};

export function HeroBlock({ section, brand, onCtaClick, sectionIndex }: HeroBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const bg = backgroundStyles[section.background ?? "gradient"];
  const isLight = section.background === "light" || section.background === "white";
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  function val(key: string, fallback: string) { return ctx?.fields[pfx ? `${pfx}.${key}` : ""] ?? fallback; }
  function set(key: string, value: string) { if (pfx) ctx?.setField(`${pfx}.${key}`, value); }

  const headline = pfx ? val("headline", section.headline) : section.headline;
  const subheadline = pfx ? val("subheadline", section.subheadline) : section.subheadline;
  const ctaText = pfx ? val("ctaText", section.ctaText) : section.ctaText;

  const inputBase = cn("bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-full",
    isLight ? "text-gray-900" : "text-white");

  return (
    <section
      className={cn("relative overflow-hidden", bg)}
      style={{ "--brand-primary": brand.primaryColor, "--brand-secondary": brand.secondaryColor } as React.CSSProperties}
    >
      {!isLight && (
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${brand.primaryColor}60, transparent)` }} />
      )}
      {!isLight && (
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />
      )}

      <div className="relative container mx-auto px-4 py-20 md:py-28 lg:py-36 max-w-6xl">
        {section.variant === "split" && section.image ? (
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-6">
              {section.badge && <span className={cn("inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border w-fit", isLight ? "bg-white border-gray-200 text-gray-700 shadow-sm" : "bg-white/10 border-white/20 text-white")}>{section.badge}</span>}
              {editMode && pfx ? (
                <input value={headline} onChange={(e) => set("headline", e.target.value)} className={cn("text-4xl md:text-5xl font-bold leading-tight", inputBase)} />
              ) : (
                <h1 className={cn("text-4xl md:text-5xl font-bold leading-tight", isLight ? "text-gray-900" : "text-white")}>{headline}</h1>
              )}
              {editMode && pfx ? (
                <textarea value={subheadline} onChange={(e) => set("subheadline", e.target.value)} rows={2} className={cn("text-lg leading-relaxed resize-none", inputBase)} />
              ) : (
                <p className={cn("text-lg leading-relaxed", isLight ? "text-gray-600" : "text-white/80")}>{subheadline}</p>
              )}
              {section.urgency && <p className={cn("text-sm font-medium", isLight ? "text-orange-600" : "text-amber-300")}>⚡ {section.urgency}</p>}
              <div className="flex flex-col sm:flex-row gap-3">
                {editMode && pfx ? (
                  <input value={ctaText} onChange={(e) => set("ctaText", e.target.value)} className={cn("px-6 py-3 rounded-lg font-semibold text-center", inputBase)} />
                ) : (
                  <Button size="lg" onClick={onCtaClick} style={{ backgroundColor: brand.primaryColor, color: "white" }}>{ctaText}</Button>
                )}
              </div>
            </div>
            {section.image && (
              <div className="relative rounded-2xl overflow-hidden shadow-2xl">
                <Image src={section.image} alt={headline} width={600} height={500} className="w-full h-auto object-cover" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto gap-6">
            {section.badge && (
              <span className={cn("inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border", isLight ? "bg-white border-gray-200 text-gray-700 shadow-sm" : "bg-white/10 border-white/20 text-white backdrop-blur-sm")}>
                {section.badge}
              </span>
            )}
            {editMode && pfx ? (
              <input value={headline} onChange={(e) => set("headline", e.target.value)} className={cn("text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-center", inputBase)} />
            ) : (
              <h1 className={cn("text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight", isLight ? "text-gray-900" : "text-white")}>{headline}</h1>
            )}
            {editMode && pfx ? (
              <textarea value={subheadline} onChange={(e) => set("subheadline", e.target.value)} rows={2} className={cn("text-lg md:text-xl leading-relaxed max-w-2xl text-center resize-none", inputBase)} />
            ) : (
              <p className={cn("text-lg md:text-xl leading-relaxed max-w-2xl", isLight ? "text-gray-600" : "text-white/80")}>{subheadline}</p>
            )}
            {section.urgency && <p className={cn("text-sm font-medium", isLight ? "text-orange-600" : "text-amber-300")}>⚡ {section.urgency}</p>}
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              {editMode && pfx ? (
                <input value={ctaText} onChange={(e) => set("ctaText", e.target.value)} className={cn("px-6 py-3 rounded-lg font-semibold text-center shadow-xl", inputBase)} />
              ) : (
                <Button size="xl" onClick={onCtaClick} className="shadow-xl shadow-black/20 hover:scale-105 transition-transform" style={{ backgroundColor: isLight ? brand.primaryColor : "white", color: isLight ? "white" : brand.primaryColor }}>
                  {ctaText}
                </Button>
              )}
              {section.ctaSecondaryText && !editMode && (
                <Button size="xl" variant="outline" onClick={onCtaClick} className={cn(isLight ? "border-gray-300" : "border-white/30 text-white hover:bg-white/10 bg-transparent")}>
                  {section.ctaSecondaryText}
                </Button>
              )}
            </div>
            {section.image && (
              <div className="relative w-full max-w-3xl mt-8 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <Image src={section.image} alt={headline} width={1200} height={675} className="w-full h-auto object-cover" />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
