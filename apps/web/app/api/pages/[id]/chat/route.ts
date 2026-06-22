import { NextRequest, NextResponse } from "next/server";
import { isPageOwner, saveChat, type StoredChat } from "@/lib/store/pages";
import { ownerId } from "@/auth";

function checkCsrf(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

// Persist the owner's chat conversation for a page so it survives across tabs,
// browsers and devices. Owner-only; the page record is already owner-scoped.
export async function POST(
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

  const body = (await req.json()) as Partial<StoredChat>;
  const chat: StoredChat = {
    messages: Array.isArray(body.messages) ? body.messages : [],
    context: body.context ?? {},
    previewVersion: typeof body.previewVersion === "number" ? body.previewVersion : 0,
    brandName: typeof body.brandName === "string" ? body.brandName : undefined,
    updatedAt: new Date().toISOString(),
  };

  await saveChat(id, chat);
  return NextResponse.json({ success: true });
}
