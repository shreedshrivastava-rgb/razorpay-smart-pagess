import Link from "next/link";
import { getAllPages } from "@/lib/store/pages";
import type { PageSchema } from "@/lib/schema/page-schema";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const pages = await getAllPages();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-6xl h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">Smart Pages</span>
            <span className="text-gray-300 mx-1">by</span>
            <span className="font-semibold text-blue-600">Razorpay</span>
          </div>
          <Link
            href="/create"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <span>+</span> New page
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-6xl py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Pages</h1>
            <p className="text-gray-500 text-sm mt-0.5">{pages.length} page{pages.length !== 1 ? "s" : ""} created</p>
          </div>
        </div>

        {pages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pages.map((page) => (
              <PageCard key={page.id} page={page} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PageCard({ page }: { page: PageSchema }) {
  const pageUrl = `/p/${page.slug}`;
  const amount = formatCurrency(page.payment.amount, page.payment.currency);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
      {/* Color bar */}
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
              onClick={() => navigator.clipboard.writeText(`${location.origin}${pageUrl}`)}
              className="text-xs text-gray-500 hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
            >
              Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-3xl bg-indigo-50 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No pages yet</h3>
      <p className="text-gray-500 text-sm mb-8 max-w-xs">
        Create your first AI-powered payment page in under 2 minutes.
      </p>
      <Link
        href="/create"
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
      >
        <span>✨</span> Create my first page
      </Link>
    </div>
  );
}
