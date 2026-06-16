import { buildGenerationPrompt, SYSTEM_PROMPT } from "./prompts";
import type { PageSchema, WizardInput, Section } from "@/lib/schema/page-schema";
import { generateId, slugify } from "@/lib/utils";

// Uses plain fetch so Next.js cannot intercept or modify headers.
// Endpoint confirmed working via: POST /anthropic/v1/messages  (x-api-key header)
function getAzureConfig() {
  const key = process.env.AI_API_KEY!;
  const base = (process.env.AI_BASE_URL ?? "").replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";
  // base may already contain /anthropic — normalise to always end with /anthropic
  const endpoint = base.endsWith("/anthropic")
    ? `${base}/v1/messages`
    : `${base}/anthropic/v1/messages`;
  return { key, endpoint, model };
}

interface GeneratedContent {
  brand: PageSchema["brand"];
  seo: PageSchema["seo"];
  sections: Section[];
}

async function callModel(prompt: string, retriesLeft = 1): Promise<string> {
  const { key, endpoint, model } = getAzureConfig();

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });
  } catch (networkErr) {
    if (retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return callModel(prompt, retriesLeft - 1);
    }
    throw networkErr;
  }

  if (!res.ok) {
    const err = await res.text();
    // Retry on transient 5xx or 429 rate-limit
    if (retriesLeft > 0 && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 2000));
      return callModel(prompt, retriesLeft - 1);
    }
    throw new Error(`${res.status} ${err}`);
  }

  const json = await res.json() as {
    content: Array<{ type: string; text: string }>;
  };

  return json.content?.[0]?.text ?? "";
}

export async function generatePageContent(input: WizardInput): Promise<GeneratedContent> {
  const prompt = buildGenerationPrompt(input);
  const raw = await callModel(prompt);

  const jsonText = raw
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  try {
    return JSON.parse(jsonText) as GeneratedContent;
  } catch {
    // If JSON was truncated mid-array/object, retry once with a continuation hint
    const retryPrompt = prompt + `\n\nIMPORTANT: Your previous response was truncated. Return the COMPLETE JSON without any truncation. Keep sections concise to fit in the token limit.`;
    try {
      const retryRaw = await callModel(retryPrompt, 0);
      const retryJson = retryRaw
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      return JSON.parse(retryJson) as GeneratedContent;
    } catch {
      throw new Error(`AI returned invalid JSON after retry. Raw: ${jsonText.slice(0, 300)}`);
    }
  }
}

export async function buildFullPage(input: WizardInput): Promise<PageSchema> {
  const generated = await generatePageContent(input);
  const brandName = input.brand.name || input.extracted?.name || "My Page";
  const slug = slugify(`${brandName}-${input.productName || "page"}`) || generateId("page");

  const page: PageSchema = {
    id: generateId("pg"),
    slug,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brand: {
      ...generated.brand,
      logo: input.brand.logo || input.extracted?.logo,
      primaryColor: input.brand.primaryColor || input.extracted?.primaryColor || "#6366f1",
      secondaryColor: input.brand.secondaryColor || "#0f172a",
      socialLinks: input.brand.socialLinks,
      deliveryInfo: input.brand.deliveryInfo,
    },
    template: "modern",
    pageType: input.pageType,
    productImageUrl: input.productImageUrl || input.extracted?.images?.[0],
    productBullets: input.productBullets?.filter(Boolean),
    sections: generated.sections,
    payment: {
      razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
      amount: input.price || 0,
      originalAmount: input.originalPrice,
      currency: input.currency || "INR",
      name: input.productName || brandName,
      description: input.productDescription,
      theme: {
        color: input.brand.primaryColor || input.extracted?.primaryColor || "#6366f1",
      },
      couponConfig: input.couponConfig,
      customFields: input.customFields,
    },
    seo: generated.seo || {
      title: `${input.productName} — ${brandName}`,
      description: input.productDescription,
    },
    reviewCount: input.reviewCount,
    averageRating: input.averageRating,
    variants: input.variants,
    maxQuantity: input.maxQuantity ?? 1,
    urgencyEndsAt: input.urgencyEndsAt,
    stockCount: input.stockCount,
    isPreOrder: input.isPreOrder ?? false,
    deliveryLabel: input.deliveryLabel,
  };

  // For collection pages: overwrite AI-generated product prices with the exact merchant values
  // (AI rounds/estimates; merchant-entered prices are authoritative)
  if (input.pageType === "collection" && input.collectionProducts?.length) {
    const gridSection = page.sections.find((s) => s.type === "product-grid");
    if (gridSection && gridSection.type === "product-grid") {
      gridSection.items = gridSection.items.map((item, i) => {
        const src = input.collectionProducts![i];
        if (!src) return item;
        return {
          ...item,
          price: src.price,
          currency: input.currency ?? "INR",
          imageUrl: item.imageUrl || src.imageUrl || "",
          bullets: item.bullets?.length ? item.bullets : (src.bullets ?? []),
          badge: item.badge || src.badge || "",
        };
      });
    }
  }

  return page;
}
