import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllPages } from "@/lib/store/pages";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const pages = await getAllPages();
    return NextResponse.json({ count: pages.length, slugs: pages.map(p => p.slug) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
