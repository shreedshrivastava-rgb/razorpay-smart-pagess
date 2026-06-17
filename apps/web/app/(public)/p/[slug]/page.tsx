import { notFound } from "next/navigation";
import { getPage } from "@/lib/store/pages";
import { PageRenderer } from "@/components/templates/PageRenderer";
import type { Metadata } from "next";
import { headers } from "next/headers";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  await ensureDemoPage(slug);
  const page = await getPage(slug);
  if (!page) return { title: "Page Not Found" };

  return {
    title: page.seo.title,
    description: page.seo.description,
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
  const { edit } = await searchParams;
  await ensureDemoPage(slug);
  const page = await getPage(slug);

  if (!page) notFound();

  return <PageRenderer page={page} editToken={edit} />;
}
