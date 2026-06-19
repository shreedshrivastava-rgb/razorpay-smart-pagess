import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPage, getPageEditToken, updatePage, deletePage } from "@/lib/store/pages";

const deleteRateLimit = new Map<string, { count: number; resetAt: number }>();
function checkDeleteRateLimit(ip: string): boolean {
  const now = Date.now();
  for (const [key, val] of deleteRateLimit) { if (now > val.resetAt) deleteRateLimit.delete(key); }
  const entry = deleteRateLimit.get(ip);
  if (!entry || now > entry.resetAt) { deleteRateLimit.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

function checkCsrf(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  // Check Origin first; fall back to Referer for clients that omit Origin
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const page = await getPage(id);
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: page });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

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
  if (!checkDeleteRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  await deletePage(id);
  return NextResponse.json({ success: true });
}
