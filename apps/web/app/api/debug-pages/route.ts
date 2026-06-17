// Temporarily add this to check getAllPages
import { NextResponse } from "next/server";
import { getAllPages } from "@/lib/store/pages";

export async function GET() {
  try {
    const pages = await getAllPages();
    return NextResponse.json({ count: pages.length, slugs: pages.map(p => p.slug) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
