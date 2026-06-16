import type { PageType, WizardInput } from "@/lib/schema/page-schema";

export const SYSTEM_PROMPT = `You are a conversion specialist who builds Razorpay payment pages.
These are NOT marketing landing pages — they are checkout-optimized pages.
The customer has already decided they're interested. Your job is to remove doubt and get them to pay.

Rules:
- Generate the sections listed in the prompt, in order
- No sections beyond what is listed — no extra hero, CTA, agenda, stats, etc.
- Benefits: 4 tight bullet points (icon + title only, NO description field)
- Testimonials: 2 real-sounding quotes, max 20 words each
- FAQ: 3 objection-handling questions — refund policy, what they get, who it's for
- Features: 3-4 items with icon + title + one-line description
- Agenda: 3-5 time slots realistic for this event type
- Speakers: 1-2 speaker cards with name, title, company, short bio
- Copy must be punchy, specific, zero fluff
- Output must be valid JSON only — no markdown, no wrapping`;

export function getSectionsByPageType(pageType: PageType): string[] {
  switch (pageType) {
    case "event":
    case "workshop":
      return ["trust", "agenda", "speakers"];
    case "course":
      return ["trust", "agenda", "faq"];
    case "consultation":
      return ["benefits", "testimonials", "faq"];
    case "saas":
    case "subscription":
      return ["features", "testimonials", "faq"];
    case "landing":
      // Full persuasion funnel — more sections, payment anchored at bottom
      return ["features", "benefits", "testimonials", "stats", "faq"];
    case "collection":
      // Multi-product grid — hero + grid + trust signal + FAQ
      return ["product-grid", "trust", "faq"];
    case "product":
    case "service":
    default:
      return ["trust", "testimonials", "faq"];
  }
}

export function buildGenerationPrompt(input: WizardInput): string {
  const {
    brand,
    pageType,
    productName,
    productDescription,
    productBullets,
    extracted,
    price,
    originalPrice,
    currency = "INR",
    reviewCount,
    averageRating,
    variants,
    urgencyEndsAt,
    stockCount,
    isPreOrder,
    deliveryLabel,
    couponConfig,
    language,
    collectionProducts,
  } = input;

  const priceFormatted = price
    ? `₹${(price / 100).toLocaleString("en-IN")}`
    : "price not set";

  const originalPriceFormatted = originalPrice
    ? `₹${(originalPrice / 100).toLocaleString("en-IN")}`
    : null;

  const brandName = brand.name || extracted?.name || "the brand";
  const primaryColor = brand.primaryColor || extracted?.primaryColor || "#6366f1";

  const bulletContext =
    productBullets?.filter(Boolean).length
      ? `\nMerchant-provided selling points:\n${productBullets.filter(Boolean).map((b) => `- ${b}`).join("\n")}`
      : "";

  const extractedContext = extracted?.content
    ? `\nExtracted website context (use for authentic copy):\n${extracted.content.slice(0, 1500)}`
    : "";

  const discountContext = originalPriceFormatted
    ? `\nPricing: was ${originalPriceFormatted}, now ${priceFormatted} (show as a deal)`
    : `\nPricing: ${priceFormatted} ${currency}`;

  const variantContext = variants?.length
    ? `\nProduct variants: ${variants.map((v) => `${v.label}: ${v.options.join(", ")}`).join("; ")}`
    : "";

  const urgencyContext = urgencyEndsAt
    ? `\nUrgency: offer ends at ${urgencyEndsAt} — weave scarcity into copy`
    : "";

  const stockContext = stockCount != null && stockCount <= 20
    ? `\nScarcity: only ${stockCount} left — reflect in trust/FAQ copy`
    : "";

  const preOrderContext = isPreOrder
    ? `\nPre-order: ship date / delivery window is "${deliveryLabel ?? "coming soon"}" — CTA should say Pre-order`
    : "";

  const couponContext = couponConfig
    ? `\nPromo: code "${couponConfig.code}" gives ${couponConfig.discountPercent}% off — mention in FAQ or trust badge`
    : "";

  const socialProofContext =
    reviewCount || averageRating
      ? `\nSocial proof: ${averageRating ? `${averageRating} stars` : ""} ${reviewCount ? `from ${reviewCount} customers` : ""} — use in testimonials headline`
      : "";

  const languageContext = language && language !== "en"
    ? `\nIMPORTANT: Generate ALL copy (headlines, descriptions, FAQ, testimonials) in language code "${language}"`
    : "";

  const collectionContext = collectionProducts?.length
    ? `\nCollection products (use EXACTLY these in the product-grid section — preserve names, prices, descriptions):\n${collectionProducts.map((p, i) =>
        `  ${i + 1}. ${p.name} — ₹${(p.price / 100).toLocaleString("en-IN")}${p.description ? ` — ${p.description}` : ""}${p.badge ? ` [badge: ${p.badge}]` : ""}${p.bullets?.length ? `\n     Bullets: ${p.bullets.join(" | ")}` : ""}`
      ).join("\n")}`
    : "";

  const landingContext = pageType === "landing"
    ? `\nIMPORTANT: This is a FULL LANDING PAGE optimised for paid-traffic and cold audiences. Write longer, more persuasive copy. The hero should have a strong hook headline, not just the product name. Stats should be real-sounding and specific. Testimonials should mention specific results.`
    : "";

  const sections = getSectionsByPageType(pageType);
  const sectionInstructions = sections
    .map((s, i) => buildSectionInstruction(s, i + 1))
    .join("\n");

  const sectionTemplates = sections.map((s, i) => buildSectionTemplate(s, i + 1)).join(",\n    ");

  return `Build a checkout page for:
- Brand: ${brandName}
- Type: ${pageType}
- Product: ${productName}
- Description: ${productDescription || "not provided"}
- Brand color: ${primaryColor}
${discountContext}
${bulletContext}
${variantContext}
${urgencyContext}
${stockContext}
${preOrderContext}
${couponContext}
${socialProofContext}
${collectionContext}
${landingContext}
${extractedContext}
${languageContext}

Generate exactly ${sections.length} sections in this order:
${sectionInstructions}

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
    ${sectionTemplates}
  ]
}`;
}

function buildSectionInstruction(type: string, n: number): string {
  switch (type) {
    case "trust":
      return `${n}. TRUST BADGES (type: "trust") — 4 short trust signals relevant to this product`;
    case "testimonials":
      return `${n}. TESTIMONIALS (type: "testimonials") — 2 real-sounding customer quotes (name + company)`;
    case "faq":
      return `${n}. FAQ (type: "faq") — 3 questions: refund policy, what they get, who it's for`;
    case "features":
      return `${n}. FEATURES (type: "features") — 3-4 items with icon, title, one-line description`;
    case "benefits":
      return `${n}. BENEFITS (type: "benefits") — 4 tight bullet points (icon + title only)`;
    case "agenda":
      return `${n}. AGENDA (type: "agenda") — 3-5 time slots with time, title, optional description`;
    case "speakers":
      return `${n}. SPEAKERS (type: "speakers") — 1-2 speakers with name, title, company, brief bio`;
    case "stats":
      return `${n}. STATS (type: "stats") — 3-4 impressive numbers that build credibility (e.g. "10,000+ customers", "98% satisfaction")`;
    case "product-grid":
      return `${n}. PRODUCT GRID (type: "product-grid") — showcase all products provided in the context, one item per product. Use the exact names, prices, and descriptions given. Add a badge where appropriate (e.g. "Best Seller", "New").`;
    default:
      return `${n}. ${type.toUpperCase()} (type: "${type}")`;
  }
}

function buildSectionTemplate(type: string, n: number): string {
  switch (type) {
    case "trust":
      return `{
      "id": "s${n}",
      "type": "trust",
      "visible": true,
      "background": "white",
      "items": [
        { "icon": "emoji", "label": "short trust signal" }
      ]
    }`;
    case "testimonials":
      return `{
      "id": "s${n}",
      "type": "testimonials",
      "visible": true,
      "background": "light",
      "headline": "What customers say",
      "layout": "grid",
      "items": [
        { "name": "Full Name", "title": "Job Title", "company": "Company", "rating": 5, "text": "quote max 20 words" }
      ]
    }`;
    case "faq":
      return `{
      "id": "s${n}",
      "type": "faq",
      "visible": true,
      "background": "white",
      "headline": "Common questions",
      "items": [
        { "question": "string", "answer": "string" }
      ]
    }`;
    case "features":
      return `{
      "id": "s${n}",
      "type": "features",
      "visible": true,
      "background": "light",
      "headline": "What you get",
      "layout": "grid-3",
      "items": [
        { "icon": "emoji", "title": "Feature title", "description": "One-line description" }
      ]
    }`;
    case "benefits":
      return `{
      "id": "s${n}",
      "type": "benefits",
      "visible": true,
      "background": "white",
      "headline": "Why choose us",
      "items": [
        { "icon": "emoji", "title": "Benefit title", "description": "" }
      ]
    }`;
    case "agenda":
      return `{
      "id": "s${n}",
      "type": "agenda",
      "visible": true,
      "background": "light",
      "headline": "What's included",
      "items": [
        { "time": "9:00 AM", "title": "Session title", "description": "optional" }
      ]
    }`;
    case "speakers":
      return `{
      "id": "s${n}",
      "type": "speakers",
      "visible": true,
      "background": "white",
      "headline": "Your instructor",
      "items": [
        { "name": "Name", "title": "Title", "company": "Company", "bio": "Short bio" }
      ]
    }`;
    case "stats":
      return `{
      "id": "s${n}",
      "type": "stats",
      "visible": true,
      "background": "brand",
      "items": [
        { "value": "10,000+", "label": "Happy customers" }
      ]
    }`;
    case "product-grid":
      return `{
      "id": "s${n}",
      "type": "product-grid",
      "visible": true,
      "background": "light",
      "headline": "Our collection",
      "subheadline": "string",
      "layout": "grid-3",
      "items": [
        {
          "id": "p1",
          "name": "Product name",
          "description": "One-line description",
          "price": 0,
          "currency": "INR",
          "imageUrl": "",
          "badge": "Best Seller",
          "bullets": ["Key benefit 1", "Key benefit 2"]
        }
      ]
    }`;
    default:
      return `{ "id": "s${n}", "type": "${type}", "visible": true }`;
  }
}
