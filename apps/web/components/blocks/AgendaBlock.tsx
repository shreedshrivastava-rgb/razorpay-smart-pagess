"use client";

import type { AgendaSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface AgendaBlockProps {
  section: AgendaSection;
  brand: Brand;
  sectionIndex?: number;
}

export function AgendaBlock({ section, brand, sectionIndex }: AgendaBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  const headline = (pfx ? ctx?.fields[`${pfx}.headline`] : undefined) ?? section.headline;
  const inputBase = "bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none w-full text-gray-900";

  return (
    <section className={cn("py-20", section.background === "light" ? "bg-gray-50" : "bg-white")}>
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-12">
          {editMode && pfx ? (
            <input value={headline} onChange={(e) => ctx?.setField(`${pfx}.headline`, e.target.value)}
              className={cn("text-3xl md:text-4xl font-bold tracking-tight text-center", inputBase)} />
          ) : (
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">{headline}</h2>
          )}
          {section.date && <p className="mt-3 text-lg font-medium" style={{ color: brand.primaryColor }}>📅 {section.date}</p>}
        </div>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 hidden md:block" style={{ backgroundColor: `${brand.primaryColor}30` }} />
          <div className="flex flex-col gap-4">
            {section.items.map((item, i) => {
              const title = (pfx ? ctx?.fields[`${pfx}.items.${i}.title`] : undefined) ?? item.title;
              const description = (pfx ? ctx?.fields[`${pfx}.items.${i}.description`] : undefined) ?? (item.description ?? "");
              return (
                <div key={i} className="relative flex gap-6 items-start">
                  <div className="hidden md:flex items-center justify-center w-12 h-12 rounded-full text-white font-bold text-sm flex-shrink-0 z-10 shadow-md" style={{ backgroundColor: brand.primaryColor }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${brand.primaryColor}15`, color: brand.primaryColor }}>
                        {item.time}
                      </span>
                      {item.speaker && <span className="text-xs text-gray-400">🎤 {item.speaker}</span>}
                    </div>
                    {editMode && pfx ? (
                      <input value={title} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.title`, e.target.value)}
                        className={cn("font-semibold mt-1 block", inputBase)} />
                    ) : (
                      <h3 className="font-semibold text-gray-900 mt-1">{title}</h3>
                    )}
                    {(description || (editMode && pfx)) && (
                      editMode && pfx ? (
                        <textarea value={description} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.description`, e.target.value)}
                          rows={2} className={cn("text-sm mt-1 leading-relaxed resize-none text-gray-500", inputBase)} />
                      ) : (
                        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
