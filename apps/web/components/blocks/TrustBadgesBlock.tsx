"use client";

import type { TrustBadgesSection, Brand } from "@/lib/schema/page-schema";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface TrustBadgesBlockProps {
  section: TrustBadgesSection;
  brand: Brand;
  sectionIndex?: number;
}

export function TrustBadgesBlock({ section, sectionIndex }: TrustBadgesBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  return (
    <section className="py-10 bg-white border-y border-gray-100">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {section.items.map((item, i) => {
            const label = (pfx ? ctx?.fields[`${pfx}.items.${i}.label`] : undefined) ?? item.label;
            return (
              <div key={i} className="flex items-center gap-2.5 text-gray-600">
                <span className="text-2xl">{item.icon}</span>
                {editMode && pfx ? (
                  <input value={label} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.label`, e.target.value)}
                    className="text-sm font-medium bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none text-gray-600" />
                ) : (
                  <span className="text-sm font-medium">{label}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
