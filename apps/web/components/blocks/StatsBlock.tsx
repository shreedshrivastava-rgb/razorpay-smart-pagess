"use client";

import type { StatsSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface StatsBlockProps {
  section: StatsSection;
  brand: Brand;
  sectionIndex?: number;
}

export function StatsBlock({ section, brand, sectionIndex }: StatsBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const isDark = section.background === "dark" || section.background === "brand" || section.background === "gradient";
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  const inputBase = cn("bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none text-center w-full", isDark ? "text-white" : "text-gray-900");

  return (
    <section
      className={cn("py-16", !isDark && (section.background === "light" ? "bg-gray-50" : "bg-white"))}
      style={
        section.background === "brand" ? { backgroundColor: brand.primaryColor }
          : section.background === "gradient" ? { background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }
            : section.background === "dark" ? { backgroundColor: "#030712" }
              : undefined
      }
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className={cn("grid gap-8",
          section.items.length <= 2 ? "grid-cols-2" : section.items.length === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4"
        )}>
          {section.items.map((stat, i) => {
            const value = (pfx ? ctx?.fields[`${pfx}.items.${i}.value`] : undefined) ?? stat.value;
            const label = (pfx ? ctx?.fields[`${pfx}.items.${i}.label`] : undefined) ?? stat.label;
            return (
              <div key={i} className="text-center">
                {editMode && pfx ? (
                  <input value={value} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.value`, e.target.value)}
                    className={cn("text-4xl md:text-5xl font-bold mb-1", inputBase)}
                    style={!isDark ? { color: brand.primaryColor } : undefined} />
                ) : (
                  <div className={cn("text-4xl md:text-5xl font-bold mb-1", isDark ? "text-white" : "text-gray-900")}
                    style={!isDark ? { color: brand.primaryColor } : undefined}>
                    {value}
                  </div>
                )}
                {editMode && pfx ? (
                  <input value={label} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.label`, e.target.value)}
                    className={cn("text-sm md:text-base", inputBase, isDark ? "text-white/70" : "text-gray-500")} />
                ) : (
                  <div className={cn("text-sm md:text-base", isDark ? "text-white/70" : "text-gray-500")}>{label}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
