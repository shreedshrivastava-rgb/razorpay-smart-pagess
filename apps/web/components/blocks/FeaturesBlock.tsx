"use client";

import type { FeaturesSection, BenefitsSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface FeaturesBlockProps {
  section: FeaturesSection | BenefitsSection;
  brand: Brand;
  sectionIndex?: number;
}

const bgMap: Record<string, string> = {
  white: "bg-white",
  light: "bg-gray-50",
  dark: "bg-gray-950 text-white",
  brand: "text-white",
  gradient: "text-white",
};

export function FeaturesBlock({ section, brand, sectionIndex }: FeaturesBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const isDark = section.background === "dark" || section.background === "brand" || section.background === "gradient";
  const layout = "layout" in section ? section.layout : "grid-3";
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  function val(key: string, fallback: string) { return (pfx ? ctx?.fields[`${pfx}.${key}`] : undefined) ?? fallback; }
  function set(key: string, value: string) { if (pfx) ctx?.setField(`${pfx}.${key}`, value); }

  const headline = val("headline", section.headline);
  const subheadline = "subheadline" in section ? val("subheadline", section.subheadline ?? "") : "";

  const gridClass = layout === "grid-2" ? "grid-cols-1 sm:grid-cols-2" : layout === "list" ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  const inputBase = cn("bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none w-full", isDark ? "text-white" : "text-gray-900");

  return (
    <section
      className={cn("py-20", bgMap[section.background ?? "light"])}
      style={
        section.background === "brand" ? { backgroundColor: brand.primaryColor }
          : section.background === "gradient" ? { background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }
            : undefined
      }
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          {editMode && pfx ? (
            <input value={headline} onChange={(e) => set("headline", e.target.value)}
              className={cn("text-3xl md:text-4xl font-bold tracking-tight text-center", inputBase)} />
          ) : (
            <h2 className={cn("text-3xl md:text-4xl font-bold tracking-tight", isDark ? "text-white" : "text-gray-900")}>{headline}</h2>
          )}
          {("subheadline" in section) && (subheadline || (editMode && pfx)) && (
            editMode && pfx ? (
              <textarea value={subheadline} onChange={(e) => set("subheadline", e.target.value)} rows={2}
                className={cn("mt-4 text-lg max-w-2xl mx-auto block text-center resize-none", inputBase, isDark ? "text-white/70" : "text-gray-500")} />
            ) : (
              <p className={cn("mt-4 text-lg max-w-2xl mx-auto", isDark ? "text-white/70" : "text-gray-500")}>{subheadline}</p>
            )
          )}
        </div>

        <div className={cn("grid gap-6", gridClass)}>
          {section.items.map((item, i) => (
            <FeatureCard key={i} item={item} isDark={isDark} brand={brand} layout={layout}
              editMode={editMode && pfx !== null}
              fieldPrefix={pfx ? `${pfx}.items.${i}` : null}
              val={(k, fb) => (pfx ? ctx?.fields[`${pfx}.items.${i}.${k}`] : undefined) ?? fb}
              set={(k, v) => { if (pfx) ctx?.setField(`${pfx}.items.${i}.${k}`, v); }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  item, isDark, brand, layout, editMode, fieldPrefix, val, set,
}: {
  item: { icon: string; title: string; description: string };
  isDark: boolean; brand: Brand; layout: string;
  editMode: boolean; fieldPrefix: string | null;
  val: (key: string, fallback: string) => string;
  set: (key: string, value: string) => void;
}) {
  const title = fieldPrefix ? val("title", item.title) : item.title;
  const description = fieldPrefix ? val("description", item.description) : item.description;
  const inputBase = cn("bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none w-full", isDark ? "text-white" : "text-gray-900");

  if (layout === "list") {
    return (
      <div className="flex gap-4 items-start p-4">
        <span className="text-2xl flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl"
          style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : `${brand.primaryColor}15` }}>
          {item.icon}
        </span>
        <div className="flex-1 min-w-0">
          {editMode && fieldPrefix ? (
            <input value={title} onChange={(e) => set("title", e.target.value)} className={cn("font-semibold text-lg", inputBase)} />
          ) : (
            <h3 className={cn("font-semibold text-lg", isDark ? "text-white" : "text-gray-900")}>{title}</h3>
          )}
          {editMode && fieldPrefix ? (
            <textarea value={description} onChange={(e) => set("description", e.target.value)} rows={2}
              className={cn("text-sm mt-1 leading-relaxed resize-none", inputBase, isDark ? "text-white/70" : "text-gray-500")} />
          ) : (
            <p className={cn("text-sm mt-1 leading-relaxed", isDark ? "text-white/70" : "text-gray-500")}>{description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("p-6 rounded-2xl transition-all duration-200 hover:-translate-y-1", isDark ? "bg-white/10 border border-white/10 hover:bg-white/15" : "bg-white border border-gray-100 shadow-sm hover:shadow-md")}>
      <span className="text-3xl mb-4 w-14 h-14 flex items-center justify-center rounded-2xl"
        style={{ backgroundColor: isDark ? "rgba(255,255,255,0.15)" : `${brand.primaryColor}15` }}>
        {item.icon}
      </span>
      {editMode && fieldPrefix ? (
        <input value={title} onChange={(e) => set("title", e.target.value)} className={cn("font-semibold text-lg mb-2 block", inputBase)} />
      ) : (
        <h3 className={cn("font-semibold text-lg mb-2", isDark ? "text-white" : "text-gray-900")}>{title}</h3>
      )}
      {editMode && fieldPrefix ? (
        <textarea value={description} onChange={(e) => set("description", e.target.value)} rows={3}
          className={cn("text-sm leading-relaxed resize-none", inputBase, isDark ? "text-white/70" : "text-gray-500")} />
      ) : (
        <p className={cn("text-sm leading-relaxed", isDark ? "text-white/70" : "text-gray-500")}>{description}</p>
      )}
    </div>
  );
}
