import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPage, getPageEditToken, updatePage, deletePage, isPageOwner, getPageChat } from "@/lib/store/pages";
import { ownerId } from "@/auth";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { checkCsrf } from "@/lib/csrf";
import type { PageSchema } from "@/lib/schema/page-schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owner = await ownerId();
  if (!owner || !(await isPageOwner(id, owner))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  let editToken: string | null = null;
  if (req.nextUrl.searchParams.get("withToken") === "1" && checkCsrf(req)) {
    editToken = await getPageEditToken(id);
  }

  // The owner reopening a page gets back its saved conversation so the chat
  // restores anywhere they sign in — not just the browser that created it.
  const chat = await getPageChat(id);

  return NextResponse.json({ success: true, data: page as PageSchema, editToken, chat });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const owner = await ownerId();
  if (!owner || !(await isPageOwner(id, owner))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storedToken = await getPageEditToken(id);
  const providedToken = req.headers.get("x-edit-token");
  if (storedToken && providedToken !== storedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const updates = await req.json();
  const page = await updatePage(id, updates);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  revalidatePath(`/p/${id}`);
  return NextResponse.json({ success: true, data: page });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit("delete", ip, 10, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }
  const { id } = await params;

  const owner = await ownerId();
  if (!owner || !(await isPageOwner(id, owner))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deletePage(id);
  return NextResponse.json({ success: true });
}
