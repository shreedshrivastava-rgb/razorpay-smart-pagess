"use client";

import { useState } from "react";
import type { FAQSection, Brand } from "@/lib/schema/page-schema";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useEditModeOptional } from "@/components/editor/EditModeContext";

interface FAQBlockProps {
  section: FAQSection;
  brand: Brand;
  sectionIndex?: number;
}

export function FAQBlock({ section, brand, sectionIndex }: FAQBlockProps) {
  const [open, setOpen] = useState<number | null>(null);
  const ctx = useEditModeOptional();
  const editMode = ctx?.editMode ?? false;

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
          : section.background === "light"
            ? "bg-gray-50"
            : "bg-white"
      )}
    >
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-12">
          {editMode && pfx ? (
            <input
              value={headline}
              onChange={(e) => set(`${pfx}.headline`, e.target.value)}
              className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 bg-transparent border-b-2 border-indigo-300 focus:border-indigo-500 outline-none text-center w-full"
            />
          ) : (
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
              {headline}
            </h2>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {section.items.map((item, i) => {
            const itemPfx = pfx ? `${pfx}.items.${i}` : null;
            const question = itemPfx ? val(`${itemPfx}.question`, item.question) : item.question;
            const answer = itemPfx ? val(`${itemPfx}.answer`, item.answer) : item.answer;
            const isOpen = editMode || open === i;

            return (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => !editMode && setOpen(open === i ? null : i)}
                >
                  {editMode && itemPfx ? (
                    <input
                      value={question}
                      onChange={(e) => set(`${itemPfx}.question`, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-gray-900 text-sm md:text-base bg-transparent border-b border-indigo-200 focus:border-indigo-400 outline-none flex-1 min-w-0"
                      placeholder="Question"
                    />
                  ) : (
                    <span className="font-medium text-gray-900 text-sm md:text-base">
                      {question}
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                    style={isOpen ? { color: brand.primaryColor } : undefined}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-50">
                    <div className="pt-4">
                      {editMode && itemPfx ? (
                        <textarea
                          value={answer}
                          onChange={(e) => set(`${itemPfx}.answer`, e.target.value)}
                          rows={3}
                          className="text-sm text-gray-600 leading-relaxed bg-transparent border border-indigo-200 focus:border-indigo-400 outline-none rounded-lg p-2 resize-none w-full"
                          placeholder="Answer"
                        />
                      ) : (
                        answer
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
