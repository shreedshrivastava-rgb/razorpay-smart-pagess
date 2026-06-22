import { NextRequest, NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { buildFullPage } from "@/lib/ai/generate-page";
import { savePage, ensureUniqueSlug, isPageOwner } from "@/lib/store/pages";
import { ownerId } from "@/auth";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";
import { collectPageImageUrls, warmImages } from "@/lib/image-gen";
import type { WizardInput } from "@/lib/schema/page-schema";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitResult = await checkRateLimit("generate", ip, 5, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
    );
  }

  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reqId = Math.random().toString(36).slice(2, 10).toUpperCase();
  try {
    const body = await req.json() as WizardInput & { existingSlug?: string };
    const { existingSlug, ...input } = body;

    if (existingSlug && !(await isPageOwner(existingSlug, owner))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!input.pageType) {
      return NextResponse.json({ error: "pageType is required" }, { status: 400 });
    }
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
      page.slug = await ensureUniqueSlug(page.slug, page.id);
    }

    const editToken = randomBytes(16).toString("hex");
    await savePage(page, editToken, owner);

    // Pre-warm AI image generation after the response is sent, so the page's
    // generated visuals are ready (or already rendering) by the time it's viewed.
    const imageUrls = collectPageImageUrls(page);
    if (imageUrls.length) after(() => warmImages(imageUrls));

    return NextResponse.json({
      success: true,
      data: { ...page, editToken },
      headers: getRateLimitHeaders(rateLimitResult),
    });
  } catch (error) {
    console.error(`[${reqId}] Generation error:`, error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
