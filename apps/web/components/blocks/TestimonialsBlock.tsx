"use client";

import type { TestimonialsSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface TestimonialsBlockProps {
  section: TestimonialsSection;
  brand: Brand;
  sectionIndex?: number;
}

export function TestimonialsBlock({ section, brand, sectionIndex }: TestimonialsBlockProps) {
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;
  const isDark = section.background === "dark";

  function val(path: string, fallback: string) {
    return ctx?.fields[path] ?? fallback;
  }
  function set(path: string, value: string) {
    ctx?.setField(path, value);
  }
  const pfx = sectionIndex !== undefined ? `sections.${sectionIndex}` : null;

  const headline = pfx ? val(`${pfx}.headline`, section.headline) : section.headline;

  return (
    <section
      className={cn(
        "py-20",
        section.background === "dark"
          ? "bg-gray-950"
          : section.background === "brand"
            ? ""
            : section.background === "light"
              ? "bg-gray-50"
              : "bg-white"
      )}
      style={section.background === "brand" ? { backgroundColor: brand.primaryColor } : undefined}
    >
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          {editMode && pfx ? (
            <input
              value={headline}
              onChange={(e) => set(`${pfx}.headline`, e.target.value)}
              className={cn(
                "text-3xl md:text-4xl font-bold tracking-tight bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none text-center w-full",
                isDark || section.background === "brand" ? "text-white" : "text-gray-900"
              )}
            />
          ) : (
            <h2
              className={cn(
                "text-3xl md:text-4xl font-bold tracking-tight",
                isDark || section.background === "brand" ? "text-white" : "text-gray-900"
              )}
            >
              {headline}
            </h2>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {section.items.map((t, i) => (
            <TestimonialCard
              key={i}
              testimonial={t}
              isDark={isDark}
              brand={brand}
              editMode={editMode && pfx !== null}
              fieldPrefix={pfx ? `${pfx}.items.${i}` : null}
              val={val}
              set={set}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({
  testimonial,
  isDark,
  brand,
  editMode,
  fieldPrefix,
  val,
  set,
}: {
  testimonial: { name: string; title?: string; company?: string; avatar?: string; rating: number; text: string };
  isDark: boolean;
  brand: Brand;
  editMode: boolean;
  fieldPrefix: string | null;
  val: (path: string, fallback: string) => string;
  set: (path: string, value: string) => void;
}) {
  const text = fieldPrefix ? val(`${fieldPrefix}.text`, testimonial.text) : testimonial.text;
  const name = fieldPrefix ? val(`${fieldPrefix}.name`, testimonial.name) : testimonial.name;
  const title = fieldPrefix ? val(`${fieldPrefix}.title`, testimonial.title ?? "") : (testimonial.title ?? "");
  const company = fieldPrefix ? val(`${fieldPrefix}.company`, testimonial.company ?? "") : (testimonial.company ?? "");

  return (
    <div
      className={cn(
        "p-6 rounded-2xl flex flex-col gap-4 transition-all duration-200 hover:-translate-y-1",
        isDark
          ? "bg-white/5 border border-white/10"
          : "bg-white border border-gray-100 shadow-sm hover:shadow-md"
      )}
    >
      {/* Stars */}
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg
            key={i}
            className="w-4 h-4"
            fill={i < testimonial.rating ? brand.primaryColor : "#e5e7eb"}
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>

      {/* Quote */}
      {editMode && fieldPrefix ? (
        <textarea
          value={text}
          onChange={(e) => set(`${fieldPrefix}.text`, e.target.value)}
          rows={3}
          className={cn(
            "text-sm leading-relaxed flex-1 bg-transparent border border-indigo-200 focus:border-indigo-400 outline-none rounded-lg p-2 resize-none w-full",
            isDark ? "text-white/80 border-white/30" : "text-gray-600"
          )}
        />
      ) : (
        <p className={cn("text-sm leading-relaxed flex-1", isDark ? "text-white/80" : "text-gray-600")}>
          &ldquo;{text}&rdquo;
        </p>
      )}

      {/* Author */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100/20">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
          style={{ backgroundColor: brand.primaryColor }}
        >
          {name[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          {editMode && fieldPrefix ? (
            <input
              value={name}
              onChange={(e) => set(`${fieldPrefix}.name`, e.target.value)}
              className={cn(
                "text-sm font-semibold bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none w-full",
                isDark ? "text-white" : "text-gray-900"
              )}
              placeholder="Reviewer name"
            />
          ) : (
            <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-gray-900")}>
              {name}
            </p>
          )}
          {editMode && fieldPrefix ? (
            <input
              value={[title, company].filter(Boolean).join(", ")}
              onChange={(e) => {
                const parts = e.target.value.split(",").map((s) => s.trim());
                set(`${fieldPrefix}.title`, parts[0] ?? "");
                set(`${fieldPrefix}.company`, parts[1] ?? "");
              }}
              className={cn(
                "text-xs bg-transparent border-b border-indigo-100 focus:border-indigo-300 outline-none w-full mt-0.5",
                isDark ? "text-white/50" : "text-gray-400"
              )}
              placeholder="Title, Company (comma-separated)"
            />
          ) : (
            (title || company) && (
              <p className={cn("text-xs", isDark ? "text-white/50" : "text-gray-400")}>
                {[title, company].filter(Boolean).join(", ")}
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
