import { notFound } from "next/navigation";
import { getPage, getPageEditToken } from "@/lib/store/pages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
import { PageRenderer } from "@/components/templates/PageRenderer";
import type { Metadata } from "next";
import { headers } from "next/headers";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

async function ensureDemoPage(slug: string) {
  if (slug !== "demo-workshop") return;
  const existing = await getPage("demo-workshop");
  if (!existing) {
    // Auto-seed the demo page on first visit
    try {
      const hdrs = await headers();
      const host = hdrs.get("host") || "localhost:3000";
      const proto = host.includes("localhost") ? "http" : "https";
      await fetch(`${proto}://${host}/api/seed`, { cache: "no-store" });
    } catch {
      // Seed inline if fetch fails
      const { GET } = await import("@/app/api/seed/route");
      await GET();
    }
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  await ensureDemoPage(slug);
  const [page, editToken] = await Promise.all([getPage(slug), getPageEditToken(slug)]);
  if (!page) return { title: "Page Not Found" };

  const isDraft = page.status === "draft";
  const hasValidPreviewToken = preview && editToken && preview === editToken;
  if (isDraft && !hasValidPreviewToken) return { title: "Page Not Found" };

  return {
    title: page.seo.title,
    description: page.seo.description,
    ...(isDraft ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: page.seo.title,
      description: page.seo.description,
      images: page.seo.ogImage ? [page.seo.ogImage] : [],
      type: "website",
    },
  };
}

export default async function PublicPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview } = await searchParams;
  await ensureDemoPage(slug);
  const [page, editToken] = await Promise.all([getPage(slug), getPageEditToken(slug)]);

  if (!page) notFound();

  const isDraft = page.status === "draft";
  const hasValidPreviewToken = preview && editToken && preview === editToken;
  if (isDraft && !hasValidPreviewToken) notFound();

  // Pages created before the token system have no stored token — they're unprotected
  // and the PATCH endpoint already allows editing them freely.
  const isProtected = editToken !== null;

  return <PageRenderer page={page} isProtected={isProtected} isDraft={isDraft} />;
}
