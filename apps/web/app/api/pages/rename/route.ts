import { NextRequest, NextResponse } from "next/server";
import { getPage, getPageEditToken, ensureUniqueSlug, publishPage, isPageOwner, updatePage } from "@/lib/store/pages";
import { bakeGeneratedImages } from "@/lib/image-bake";
import { ownerId } from "@/auth";

export async function POST(req: NextRequest) {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (!(await isPageOwner(fromSlug, owner))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [page, editToken] = await Promise.all([
    getPage(fromSlug),
    getPageEditToken(fromSlug),
  ]);

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const finalSlug = clean === fromSlug ? fromSlug : await ensureUniqueSlug(clean, page.id);

  // Bake generated images into permanent Blob storage so the live page loads
  // instantly (no on-view AI generation / load flash). Best-effort.
  try {
    const baked = await bakeGeneratedImages(page);
    if (baked) await updatePage(fromSlug, baked);
  } catch { /* non-fatal — page still renders with live-generated images */ }

  try {
    await publishPage(fromSlug, finalSlug, editToken ?? "");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Publish failed";
    if (msg.includes("taken")) return NextResponse.json({ error: "That name is taken — try another." }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ success: true, data: { slug: finalSlug } });
}
