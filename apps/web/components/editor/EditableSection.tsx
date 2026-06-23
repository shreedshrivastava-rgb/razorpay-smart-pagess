"use client";

import { useRef, type ReactNode } from "react";
import { useEditModeOptional } from "./EditModeContext";

// Wraps a page section. For the owner (canEdit), a hover "Edit" button appears in
// the corner; clicking it turns on edit mode and scrolls the section into view so
// its text/price/images become editable inline. For everyone else it renders the
// section untouched.
export function EditableSection({ label, children }: { label?: string; children: ReactNode }) {
  const ctx = useEditModeOptional();
  const ref = useRef<HTMLDivElement>(null);

  if (!ctx?.canEdit) return <>{children}</>;
  const { editMode, enable } = ctx;

  return (
    <div ref={ref} className="relative group/edit">
      {!editMode && (
        <button
          type="button"
          onClick={() => {
            enable();
            ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity hover:bg-indigo-500 group-hover/edit:opacity-100"
          title={label ? `Edit ${label}` : "Edit this section"}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit{label ? ` ${label}` : ""}
        </button>
      )}
      {/* Subtle outline while editing so it's clear the section is editable */}
      {editMode && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-2 ring-inset ring-indigo-400/30" />
      )}
      {children}
    </div>
  );
}
