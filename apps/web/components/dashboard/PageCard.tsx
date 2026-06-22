"use client";

import Link from "next/link";
import type { PageSchema } from "@/lib/schema/page-schema";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

export function PageCard({ page }: { page: PageSchema }) {
  const pageUrl = `/p/${page.slug}`;
  const amount = formatCurrency(page.payment.amount, page.payment.currency);
  const [copied, setCopied] = useState(false);

  function copyLink(e: React.MouseEvent) {
    e.preventDefault();
    void navigator.clipboard.writeText(`${location.origin}${pageUrl}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Live page preview — scaled iframe */}
      <Link href={pageUrl} target="_blank" className="block relative overflow-hidden bg-gray-100" style={{ height: 200 }}>
        <iframe
          src={pageUrl}
          className="absolute top-0 left-0 border-0 pointer-events-none select-none"
          style={{
            width: 1280,
            height: 960,
            transform: "scale(0.3125)",
            transformOrigin: "top left",
          }}
          loading="lazy"
          tabIndex={-1}
          title={page.brand.name}
          sandbox="allow-scripts allow-same-origin"
        />
        {/* Click-through shield + hover overlay */}
        <div className="absolute inset-0 group-hover:bg-black/5 transition-colors" />
        <span className="absolute top-2.5 right-2.5 text-xs font-semibold text-emerald-600 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
          Live
        </span>
      </Link>

      {/* Metadata */}
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {page.brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.brand.logo} alt="" className="w-7 h-7 rounded-md object-contain border border-gray-100 shrink-0" />
          ) : (
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: page.brand.primaryColor }}
            >
              {page.brand.name[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{page.brand.name}</p>
            <p className="text-xs text-gray-400 truncate">{page.payment.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-gray-900 text-sm">{amount}</span>
          <button
            onClick={copyLink}
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
          >
            {copied ? "✓" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
