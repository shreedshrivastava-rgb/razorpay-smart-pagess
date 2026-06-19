"use client";

import type { SpeakersSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface SpeakersBlockProps {
  section: SpeakersSection;
  brand: Brand;
  sectionIndex?: number;
}

export function SpeakersBlock({ section, brand, sectionIndex }: SpeakersBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  const headline = (pfx ? ctx?.fields[`${pfx}.headline`] : undefined) ?? section.headline;
  const inputBase = "bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none w-full";

  return (
    <section className={cn("py-20", section.background === "light" ? "bg-gray-50" : "bg-white")}>
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          {editMode && pfx ? (
            <input value={headline} onChange={(e) => ctx?.setField(`${pfx}.headline`, e.target.value)}
              className={cn("text-3xl md:text-4xl font-bold tracking-tight text-center text-gray-900", inputBase)} />
          ) : (
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">{headline}</h2>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {section.items.map((speaker, i) => {
            const name = (pfx ? ctx?.fields[`${pfx}.items.${i}.name`] : undefined) ?? speaker.name;
            const bio = (pfx ? ctx?.fields[`${pfx}.items.${i}.bio`] : undefined) ?? (speaker.bio ?? "");
            const title = (pfx ? ctx?.fields[`${pfx}.items.${i}.title`] : undefined) ?? (speaker.title ?? "");
            const company = (pfx ? ctx?.fields[`${pfx}.items.${i}.company`] : undefined) ?? (speaker.company ?? "");
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg" style={{ backgroundColor: brand.primaryColor }}>
                    {name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editMode && pfx ? (
                      <input value={name} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.name`, e.target.value)}
                        className={cn("font-semibold text-gray-900 block", inputBase)} />
                    ) : (
                      <h3 className="font-semibold text-gray-900">{name}</h3>
                    )}
                    {editMode && pfx ? (
                      <input value={title} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.title`, e.target.value)}
                        className={cn("text-sm text-gray-500 mt-0.5 block", inputBase)} />
                    ) : (
                      <p className="text-sm text-gray-500">{title}</p>
                    )}
                    {editMode && pfx ? (
                      <input value={company} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.company`, e.target.value)}
                        className={cn("text-xs font-medium mt-0.5 block", inputBase)} style={{ color: brand.primaryColor }} />
                    ) : (
                      <p className="text-xs font-medium" style={{ color: brand.primaryColor }}>{company}</p>
                    )}
                  </div>
                </div>
                {editMode && pfx ? (
                  <textarea value={bio} onChange={(e) => ctx?.setField(`${pfx}.items.${i}.bio`, e.target.value)}
                    rows={3} className={cn("text-sm text-gray-600 leading-relaxed resize-none", inputBase)} />
                ) : (
                  <p className="text-sm text-gray-600 leading-relaxed">{bio}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
