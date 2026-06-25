import { NextRequest, NextResponse } from "next/server";
import { getAllPages, savePage } from "@/lib/store/pages";
import { ownerId } from "@/auth";
import { logger } from "@/lib/logger";
import { checkCsrf } from "@/lib/csrf";
import type { PageSchema } from "@/lib/schema/page-schema";

export async function GET() {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pages = await getAllPages(owner);
    return NextResponse.json({ success: true, data: pages });
  } catch (error) {
    logger.error({ err: error }, "list pages error");
    return NextResponse.json({ error: "Failed to list pages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page: PageSchema = await req.json();
    await savePage(page, undefined, owner);
    return NextResponse.json({ success: true, data: page });
  } catch (error) {
    logger.error({ err: error }, "save page error");
    return NextResponse.json({ error: "Failed to save page" }, { status: 500 });
  }
}
