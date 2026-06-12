import type { PageType, WizardInput } from "@/lib/schema/page-schema";

export const SYSTEM_PROMPT = `You are a conversion specialist who builds Razorpay payment pages.
These are NOT marketing landing pages — they are checkout-optimized pages.
The customer has already decided they're interested. Your job is to remove doubt and get them to pay.

Rules:
- Generate exactly 3 sections: trust badges, testimonials, faq
- No hero section, no agenda, no speakers, no stats, no CTA sections
- Benefits: 4 tight bullet points (icon + title only, NO description field)
- Testimonials: 2 real-sounding quotes, max 20 words each
- FAQ: 3 objection-handling questions — refund policy, what they get, who it's for
- Copy must be punchy, specific, zero fluff
- Output must be valid JSON only — no markdown, no wrapping`;

export function buildGenerationPrompt(input: WizardInput): string {
  const {
    brand,
    pageType,
    productName,
    productDescription,
    productBullets,
    extracted,
    price,
    currency = "INR",
  } = input;

  const priceFormatted = price
    ? `₹${(price / 100).toLocaleString("en-IN")}`
    : "price not set";

  const brandName = brand.name || extracted?.name || "the brand";
  const primaryColor = brand.primaryColor || extracted?.primaryColor || "#6366f1";

  const bulletContext =
    productBullets?.filter(Boolean).length
      ? `\nMerchant-provided selling points:\n${productBullets.filter(Boolean).map((b) => `- ${b}`).join("\n")}`
      : "";

  const extractedContext = extracted?.content
    ? `\nExtracted website context (use for authentic copy):\n${extracted.content.slice(0, 1500)}`
    : "";

  return `Build a checkout page for:
- Brand: ${brandName}
- Type: ${pageType}
- Product: ${productName}
- Description: ${productDescription || "not provided"}
- Price: ${priceFormatted} ${currency}
- Brand color: ${primaryColor}
${bulletContext}
${extractedContext}

Generate exactly 3 sections in this order:

1. TRUST BADGES (type: "trust") — 4 short trust signals relevant to this product
2. TESTIMONIALS (type: "testimonials") — 2 real-sounding customer quotes (name + company)
3. FAQ (type: "faq") — 3 questions: refund policy, what they get, who it's for

Return this JSON structure only:
{
  "brand": {
    "name": "${brandName}",
    "primaryColor": "${primaryColor}",
    "secondaryColor": "string",
    "tagline": "string"
  },
  "seo": {
    "title": "string",
    "description": "string"
  },
  "sections": [
    {
      "id": "s1",
      "type": "trust",
      "visible": true,
      "background": "white",
      "items": [
        { "icon": "emoji", "label": "short trust signal" }
      ]
    },
    {
      "id": "s2",
      "type": "testimonials",
      "visible": true,
      "background": "light",
      "headline": "What customers say",
      "layout": "grid",
      "items": [
        { "name": "Full Name", "title": "Job Title", "company": "Company", "rating": 5, "text": "quote max 20 words" }
      ]
    },
    {
      "id": "s3",
      "type": "faq",
      "visible": true,
      "background": "white",
      "headline": "Common questions",
      "items": [
        { "question": "string", "answer": "string" }
      ]
    }
  ]
}`;
}

// Kept for schema compatibility
export function getSectionsByPageType(pageType: PageType): string[] {
  void pageType;
  return ["trust", "testimonials", "faq"];
}
