import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageEditToken, ensureUniqueSlug, publishPage } from "@/lib/store/pages";

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

  const finalSlug = clean === fromSlug ? fromSlug : await ensureUniqueSlug(clean, page.id);

  try {
    await publishPage(fromSlug, finalSlug, editToken ?? "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publish failed";
    if (msg.includes("taken")) return NextResponse.json({ error: "That name is taken — try another." }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ success: true, data: { slug: finalSlug } });
}
