"use client";

import Link from "next/link";
import type { PageSchema } from "@/lib/schema/page-schema";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

export function PageCard({ page }: { page: PageSchema }) {
  const pageUrl = `/p/${page.slug}`;
  const amount = formatCurrency(page.payment.amount, page.payment.currency);
  const [copied, setCopied] = useState(false);

  function copyLink() {
    void navigator.clipboard.writeText(`${location.origin}${pageUrl}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
      <div
        className="h-2"
        style={{
          background: `linear-gradient(90deg, ${page.brand.primaryColor}, ${page.brand.secondaryColor})`,
        }}
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            {page.brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.brand.logo} alt="" className="w-8 h-8 rounded-lg object-contain border border-gray-100" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: page.brand.primaryColor }}
              >
                {page.brand.name[0]}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">{page.brand.name}</p>
              <p className="text-xs text-gray-400 capitalize">{page.pageType}</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            Live
          </span>
        </div>

        <h3 className="font-medium text-gray-700 text-sm mb-1 line-clamp-1">
          {page.payment.name}
        </h3>
        <p className="text-xs text-gray-400 line-clamp-2 mb-4">
          {page.payment.description}
        </p>

        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
          <span className="font-bold text-gray-900">{amount}</span>
          <div className="flex items-center gap-2">
            <Link
              href={pageUrl}
              target="_blank"
              className="text-xs text-gray-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
            >
              View →
            </Link>
            <button
              onClick={copyLink}
              className="text-xs text-gray-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
