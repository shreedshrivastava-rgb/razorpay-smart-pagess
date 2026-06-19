import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageEditToken, savePage, deletePage, ensureUniqueSlug } from "@/lib/store/pages";

export async function POST(req: NextRequest) {
  let body: { fromSlug: string; toSlug: string };
  try {
    body = await req.json() as { fromSlug: string; toSlug: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fromSlug, toSlug } = body;
  if (!fromSlug || !toSlug) {
    return NextResponse.json({ error: "fromSlug and toSlug required" }, { status: 400 });
  }

  const clean = toSlug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!clean || !/^[a-z0-9]/.test(clean)) {
    return NextResponse.json({ error: "Slug must start with a letter or number" }, { status: 400 });
  }

  const [page, editToken] = await Promise.all([
    getPage(fromSlug),
    getPageEditToken(fromSlug),
  ]);

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // If same slug, no rename needed
  if (clean === fromSlug) {
    return NextResponse.json({ success: true, data: { slug: fromSlug } });
  }

  const finalSlug = await ensureUniqueSlug(clean, page.id);
  await savePage({ ...page, slug: finalSlug }, editToken ?? undefined);
  await deletePage(fromSlug);

  return NextResponse.json({ success: true, data: { slug: finalSlug } });
}
