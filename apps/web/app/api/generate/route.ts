import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildFullPage } from "@/lib/ai/generate-page";
import { savePage, ensureUniqueSlug, isPageOwner } from "@/lib/store/pages";
import { ownerId } from "@/auth";
import type { WizardInput } from "@/lib/schema/page-schema";

// Simple in-memory rate limit: max 5 generations per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) { if (now > val.resetAt) rateLimitMap.delete(key); }
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reqId = Math.random().toString(36).slice(2, 10).toUpperCase();
  try {
    const body = await req.json() as WizardInput & { existingSlug?: string };
    const { existingSlug, ...input } = body;

    // Regenerating an existing page — caller must own it.
    if (existingSlug && !(await isPageOwner(existingSlug, owner))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!input.pageType) {
      return NextResponse.json({ error: "pageType is required" }, { status: 400 });
    }
    // Collection pages use the brand name as the page name if no product name given
    if (!input.productName) {
      if (input.pageType === "collection") {
        input.productName = input.brand?.name ?? "Our Collection";
      } else {
        return NextResponse.json({ error: "productName is required" }, { status: 400 });
      }
    }

    const page = await buildFullPage(input);
    page.status = "draft";
    page.payment.razorpayMode = "test";

    if (existingSlug) {
      page.slug = existingSlug;
    } else {
      // Prevent slug collisions — append counter if the slug already exists
      page.slug = await ensureUniqueSlug(page.slug, page.id);
    }

    const editToken = randomBytes(16).toString("hex");
    await savePage(page, editToken, owner);

    return NextResponse.json({ success: true, data: { ...page, editToken } });
  } catch (error) {
    console.error(`[${reqId}] Generation error:`, error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
