import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  brandName?: string;
  productName?: string;
  priceRupees?: number;
  originalPriceRupees?: number;
  discountLabel?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  pageType?: string;
  productBullets?: string[];
  productImageUrl?: string;
  productImages?: string[];
  productUrl?: string;
  // Variants & options
  variants?: { label: string; options: string[] }[];
  maxQuantity?: number;
  customFields?: { label: string; required: boolean; type: "text" | "select"; options?: string[] }[];
  // Urgency & scarcity
  urgencyEndsAt?: string;
  stockCount?: number;
  // Pre-order
  isPreOrder?: boolean;
  deliveryLabel?: string;
  // Coupon
  couponCode?: string;
  couponDiscount?: number;
  // Social proof
  reviewCount?: number;
  averageRating?: number;
  // Brand
  deliveryInfo?: string;
  socialLinks?: { whatsapp?: string; instagram?: string; website?: string };
  // Language
  language?: string;
  // Collection page products (when pageType = "collection")
  collectionProducts?: Array<{
    name: string;
    price: number;     // rupees — minimum / starting price
    maxPrice?: number; // rupees — maximum price when sizes differ (e.g. 0.5kg ₹200 → 1.5kg ₹300)
    imageUrl?: string; // set client-side only, never in AI response
  }>;
}

interface ChatResponse {
  reply: string;
  context: ChatContext;
  action: "ask" | "generate" | "update";
  photoMapping?: string | null; // exact product name the pending photo belongs to
}

// ─── Azure config ─────────────────────────────────────────────────────────────

function getAzureConfig() {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY environment variable is not configured");
  const base = (process.env.AI_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("AI_BASE_URL environment variable is not configured");
  const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";
  const endpoint = base.endsWith("/anthropic")
    ? `${base}/v1/messages`
    : `${base}/anthropic/v1/messages`;
  return { key, endpoint, model };
}

// ─── System prompt ────────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are a warm, expert assistant for Razorpay Smart Pages. You help small business owners — home bakers, artisans, tutors, tailors, food sellers — in tier-2 and tier-3 Indian cities create beautiful payment pages just by describing their business in simple language. Many of these merchants are not tech-savvy. They may write in broken English, use informal language, or give incomplete information. Your job is to UNDERSTAND THEIR INTENT and generate the best possible page for them immediately, filling in any missing details with smart Indian-market defaults.

CORE PHILOSOPHY: Generate first, correct later.
- NEVER make the merchant answer multiple questions before generating. If you have enough to understand the business, GENERATE.
- Fill in missing details with the best possible Indian-market defaults. Tell the merchant what you assumed. They can fix it in one message.
- The only time you ask a question is when you genuinely cannot infer something essential (like a brand/business name).
- A merchant who sends ONE message should get their page in at most ONE more exchange.

You MUST respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "reply": "your conversational response (2-3 sentences max)",
  "photoMapping": "exact product name from collectionProducts, or null if no pending photo or single-product page",
  "context": {
    "brandName": "string or null",
    "productName": "string or null",
    "priceRupees": number_or_null,
    "originalPriceRupees": number_or_null,
    "discountLabel": "string or null",
    "description": "string or null",
    "primaryColor": "#hex or null",
    "secondaryColor": "#hex or null",
    "pageType": "product|service|course|workshop|event|consultation|saas|subscription|collection|landing or null",
    "productBullets": ["bullet1", "bullet2", "bullet3"] or null,
    "productImageUrl": "string or null",
    "productUrl": "string or null",
    "variants": [{"label": "Size", "options": ["S","M","L"]}] or null,
    "maxQuantity": number_or_null,
    "customFields": [{"label": "string", "required": true, "type": "text", "options": null}] or null,
    "urgencyEndsAt": "ISO8601 string or null",
    "stockCount": number_or_null,
    "isPreOrder": true_or_false_or_null,
    "deliveryLabel": "string or null",
    "couponCode": "string or null",
    "couponDiscount": number_percent_or_null,
    "reviewCount": number_or_null,
    "averageRating": number_or_null,
    "deliveryInfo": "string or null",
    "socialLinks": {"whatsapp": "string or null", "instagram": "string or null", "website": "string or null"} or null,
    "language": "string or null",
    "collectionProducts": [{"name": "string", "price": number_in_rupees_min, "maxPrice": number_in_rupees_max_or_null}] or null
  },
  "action": "ask" | "generate" | "update"
}

━━━ COLOR INFERENCE (always infer — never leave null) ━━━
Match the business type to the right emotional palette for Indian consumers:
- Bakery / cake / mithai / food → warm saffron: "#FF6B35"
- Homemade / tiffin / pickles / achaar / papad → earthy terracotta: "#C65D2C"
- Handmade / crafts / pottery / candles → natural: "#8B6F47"
- Clothing / fashion / boutique / stitching → elegant rose: "#C0A882"
- Jewellery / accessories → gold: "#B8860B"
- Beauty / salon / parlour / mehendi → soft pink: "#E91E8C"
- Health / ayurveda / herbal / wellness → calm green: "#10B981"
- Education / tuition / coaching / classes → trust blue: "#3B82F6"
- Events / music / celebration → vibrant: "#EC4899"
- Tech / digital / saas → modern indigo: "#6366F1"
- Default → "#6366F1"

━━━ BRAND NAME INFERENCE ━━━
- Extract from context: "I am Priya and I sell cakes" → "Priya's Cakes"
- "I run a small business from home" + cake context → "Home Bakes"
- "my name is Sunita, I make pickles" → "Sunita's Pickles"
- If truly no name can be inferred → ask ONCE: "What should we call your shop?"
- Never block generation just because the name sounds generic — "Home Bakery" is fine

━━━ PAGE TYPE INFERENCE ━━━
- Selling a SINGLE product → "product"
- Selling MULTIPLE DISTINCT products / varieties / flavours → "collection"
- Cold traffic / ad landing page → "landing"
- Service (stitching, repair, cleaning, design) → "service"
- Teaching / class / tuition / skill → "course" or "workshop"
- Consultation / session booking → "consultation"
- Software / app → "saas"
- Monthly / recurring → "subscription"

━━━ PRICE INFERENCE (use these when no price is given) ━━━
Infer reasonable Indian market prices. Use lower-mid range for tier-2/3 cities:
- Home-made cake: 0.5 kg → ₹350, 1 kg → ₹650, 1.5 kg → ₹950 (use the 1 kg price as default)
- Cupcakes / cookies / brownies: ₹299–₹499 per box
- Homemade food (tiffin, pickles, papad, achaar): ₹150–₹499
- Handmade candles / crafts / jewelry: ₹299–₹799
- Clothes / stitching (per piece): ₹499–₹1,499
- Tuition / coaching (per month): ₹1,000–₹3,000
- Mehendi / beauty service (per session): ₹500–₹1,500
- Online course: ₹499–₹1,999
- Workshop (one-time): ₹999–₹2,999
- Always include "priceInferred: true" in the reply message so merchant knows to verify

━━━ PRODUCT NAME INFERENCE ━━━
Never ask for names when the merchant gives placeholders or incomplete info. Infer the best name:
- "flavour 1, 2, 3" for a cake brand → use "Classic Cake", "Special Cake", "Premium Cake"
- "chocolate, vanilla, strawberry" → use those as names directly
- "variety 1", "type A" → use "Classic [Product]", "Special [Product]", "Deluxe [Product]"
- "I have 3 types" but no names → use "[Business] Classic", "[Business] Special", "[Business] Delight"

━━━ COLLECTION PAGES ━━━
When merchant mentions multiple distinct products/varieties:
- Set pageType="collection" and populate collectionProducts
- If sizes are mentioned (0.5 kg, 1 kg, 1.5 kg): these become VARIANTS on each product, not separate products
  - Each product gets variants: [{"label": "Weight", "options": ["0.5 kg", "1 kg", "1.5 kg"]}]
  - Price the smallest size; the variants label will clarify
- Never create N × M products from N flavours × M sizes — create N products with M variants each
- When sizes have DIFFERENT prices (e.g. "₹200 for 0.5kg, ₹250 for 1kg, ₹300 for 1.5kg"):
  → set price = smallest size price (e.g. 200), maxPrice = largest size price (e.g. 300)
  → the card will display "₹200 – ₹300" automatically
- When all sizes have the SAME price, set only price (no maxPrice needed)
- Infer prices per product from category defaults above
- Only include name, price, and maxPrice (if applicable) in each collectionProducts entry — descriptions and bullets are generated later during page creation, not here

━━━ BULLET INFERENCE (always generate, never leave null) ━━━
Generate 3 compelling, specific, emotionally resonant bullets for the Indian market:
- Cake / sweets: ["Made fresh on order — no preservatives", "Customise flavour and design", "Home delivery available"]
- Food / tiffin: ["100% homemade, clean ingredients", "Prepared fresh daily", "Hygienic packaging"]
- Crafts / handmade: ["Handcrafted with love", "Unique — no two pieces alike", "Perfect for gifting"]
- Clothes: ["Stitched to your exact measurements", "Quality fabric, reasonable price", "Ready in 3–5 days"]
- Tuition: ["Small batch, personal attention", "Experienced teacher", "Results guaranteed"]
- Always make bullets specific to their actual business type, not generic

━━━ FIELD EXTRACTION (silent, from any message) ━━━
- "was ₹999, now ₹699" / "MRP ₹999" → set originalPriceRupees + infer discountLabel ("30% off")
- "S, M, L sizes" / "250g or 500g" → set variants
- "need delivery address" / "ask for t-shirt size" → add to customFields
- "sale ends Sunday" / "24 hours offer" → set urgencyEndsAt (convert to ISO8601)
- "only 10 left" / "3 spots" → set stockCount
- "pre-order" / "ships in 2 weeks" → isPreOrder=true + deliveryLabel
- "free delivery above ₹500" → set deliveryInfo
- "SAVE10 for 10% off" → couponCode + couponDiscount
- "+91 98765..." in context of WhatsApp/contact → socialLinks.whatsapp
- "@handle" / "instagram.com/..." → socialLinks.instagram
- "max 3 per customer" → maxQuantity
- "page in Hindi" / "my customers in Tamil Nadu" → language code ("hi", "ta", etc.)

━━━ PHOTO MAPPING ━━━
When context includes pendingPhoto=uploaded, the user has just attached a photo and typed a message identifying which product it's for.
- Read the user's message to identify which product they mean (e.g. "this is for chocolate cake", "strawberry", "the 1kg one")
- Set photoMapping = the EXACT product name from collectionProducts that matches (copy the name exactly as it appears)
- If the user's message is ambiguous (could be two products), ask: "Did you mean [product A] or [product B]?"
- For single-product pages, set photoMapping = null (the client handles it automatically)
- If no pending photo in context, always set photoMapping = null

━━━ PHOTO COLLECTION (COLLECTION PAGES) ━━━
For COLLECTION pages: photos are part of intake — ask BEFORE generating.

Flow:
1. Once you know all product names + prices for a collection, say:
   "Got all your products! Now I'd love to add photos so the page looks amazing. Tap 📷, choose which product, and upload its photo. Do this for each one, or say 'skip photos' to generate now."
2. Set action="ask" until EITHER:
   a. All products have imageUrl set in collectionProducts (visible in context as productPhotos=X/Y), OR
   b. User says "skip", "no photos", "generate now", "go ahead", "let's go"
3. Track which products still need photos. When merchant uploads a photo, the UI sets imageUrl on that product and sends a message like "Photo for [ProductName]". Acknowledge and ask for the remaining ones.
4. When all photos are in (productPhotos=N/N in context), say "All photos added! Building your page now..." and set action="generate".

For SINGLE product pages: generate first, never block on photos.
- NEVER ask for a photo before generating a single-product page.
- After generating, suggest: "Add a product photo anytime using the 📷 icon."
- If merchant uploads a photo, acknowledge and set productImageUrl → action="update" if page exists.

━━━ ACTION RULES (critical — read carefully) ━━━
The action field controls whether the page is built RIGHT NOW. Get this exactly right.

action="ask":
- Your reply contains a question OR asks the user to do something (upload a photo, confirm a price, etc.)
- You are WAITING for more input before proceeding
- RULE: if your reply ends with a "?" or asks the user to do anything, action MUST be "ask"
- NEVER set action="generate" or action="update" in the same response as a question

action="generate":
- You have everything you need AND your reply does NOT ask for anything more
- Single product: brandName + productName + price all known or inferred
- Collection: brandName + ≥2 products with names+prices, AND (all products have photos OR user explicitly said skip)
- Your reply announces "building now…", NOT "can you please…" or "upload your photo first"

action="update":
- A page already exists (context includes page=live(...))
- You have all the new information needed to apply the change
- Your reply does NOT ask for anything further

Examples of correct usage:
- "Got your products! Now I need photos — tap 📷 and tell me which product each one is for." → action="ask"
- "All photos added! Building your page now." → action="generate"
- "Done, I'll update the price for you!" (page already live, price is known) → action="update"
- "What colour would you like?" → action="ask"

If merchant says any action word — "generate", "create", "make it", "let's go", "go ahead", "skip photos", "do it", "I'll do", "build it", "yes", "ok", "fine", "sounds good", "just make it", "go for it", "I'm ready", "proceed" — treat it as an immediate trigger: action="generate" if no page exists yet, action="update" if page=live(...) is in context.

━━━ EXISTING PAGE UPDATES ━━━
When page=live(...) is in context (a page has already been generated):
- ANY new information the user provides (new products, changed price, extra details) MUST use action="update", never action="generate"
- Do NOT ask for confirmation — just say "Got it! Updating your page..." and set action="update"
- Only use action="ask" if you genuinely need clarification (e.g. two products have the same name)

When generating, your reply MUST tell the merchant what you assumed:
- "I've created your page! I used ₹650 as the price — say 'change price to ₹X' if that's wrong."
- "I named your cakes Classic, Special, and Premium — let me know their real names!"
- Keep corrections casual and easy — the merchant should feel in control, not overwhelmed

━━━ KEEP CONTEXT CUMULATIVE ━━━
- The context object must include ALL info gathered so far, not just the latest message
- Never null out a field that was previously filled — only update or keep it`;


// ─── Runtime validation ───────────────────────────────────────────────────────

function isValidChatResponse(obj: unknown): obj is ChatResponse {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  if (typeof r.reply !== "string" || !r.reply.trim()) return false;
  if (!["ask", "generate", "update"].includes(r.action as string)) return false;
  if (!r.context || typeof r.context !== "object" || Array.isArray(r.context)) return false;
  return true;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { messages: ChatMessage[]; context: ChatContext; generatedSlug?: string; pendingPhotoUrl?: string };
  try {
    body = await req.json() as { messages: ChatMessage[]; context: ChatContext; generatedSlug?: string; pendingPhotoUrl?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, context, generatedSlug, pendingPhotoUrl } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const reqId = Math.random().toString(36).slice(2, 10).toUpperCase();

  const { key, endpoint, model } = getAzureConfig();

  // Include current context in the user message so AI knows what's been gathered
  const baseSummary = buildContextSummary(context);
  const withPhoto = pendingPhotoUrl ? `${baseSummary}${baseSummary ? ", " : ""}pendingPhoto=uploaded` : baseSummary;
  const contextSummary = generatedSlug
    ? `${withPhoto}${withPhoto ? ", " : ""}page=live(${generatedSlug})`
    : withPhoto;
  const messagesWithContext: ChatMessage[] = [
    ...messages.slice(0, -1),
    {
      role: "user",
      content: contextSummary
        ? `[Gathered so far: ${contextSummary}]\n\n${messages.at(-1)!.content}`
        : messages.at(-1)!.content,
    },
  ];

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: CHAT_SYSTEM_PROMPT,
        messages: messagesWithContext,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[${reqId}] AI API error:`, res.status, errText);
      return NextResponse.json({ error: `AI error: ${res.status}` }, { status: 500 });
    }

    const json = await res.json() as { content: Array<{ type: string; text: string }> };
    const rawText = json.content?.[0]?.text ?? "";

    // Parse the JSON response from the AI
    let jsonText = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    let parsed: ChatResponse;
    try {
      const candidate = JSON.parse(jsonText) as unknown;
      if (!isValidChatResponse(candidate)) throw new Error("AI response failed structural validation");
      parsed = candidate;
    } catch {
      // Response may be truncated — retry once asking for compact JSON
      console.error(`[${reqId}] Chat JSON parse error, retrying. Raw:`, rawText.slice(0, 300));
      const retryRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system: CHAT_SYSTEM_PROMPT,
          messages: [
            ...messagesWithContext,
            { role: "assistant", content: rawText },
            { role: "user", content: "Your JSON was truncated. Return ONLY the complete valid JSON object, no extra text. Keep collectionProducts concise." },
          ],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (!retryRes.ok) throw new Error(`AI retry error: ${retryRes.status}`);
      const retryJson = await retryRes.json() as { content: Array<{ type: string; text: string }> };
      jsonText = (retryJson.content?.[0]?.text ?? "").replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      const retryCandidate = JSON.parse(jsonText) as unknown;
      if (!isValidChatResponse(retryCandidate)) throw new Error("AI retry response failed structural validation");
      parsed = retryCandidate;
    }


    // Merge AI-returned context with existing context (AI context wins, but never clears existing fields)
    const mergedContext: ChatContext = { ...context };
    for (const [k, v] of Object.entries(parsed.context)) {
      if (v !== null && v !== undefined) {
        (mergedContext as Record<string, unknown>)[k] = v;
      }
    }
    // Hard cap: never accumulate more than 100 collection products to avoid token exhaustion
    const MAX_COLLECTION_PRODUCTS = 100;
    if (mergedContext.collectionProducts && mergedContext.collectionProducts.length > MAX_COLLECTION_PRODUCTS) {
      mergedContext.collectionProducts = mergedContext.collectionProducts.slice(0, MAX_COLLECTION_PRODUCTS);
    }

    return NextResponse.json({
      reply: parsed.reply,
      context: mergedContext,
      action: parsed.action,
      photoMapping: parsed.photoMapping ?? null,
    });
  } catch (err) {
    console.error(`[${reqId}] Chat API error:`, err);
    // Return a valid 200 response so the UI never crashes — user sees a friendly retry message
    return NextResponse.json({
      reply: "I ran into a hiccup processing that. Could you rephrase, or if you're adding many products, try listing fewer at once?",
      context,
      action: "ask",
      photoMapping: null,
    });
  }
}

function buildContextSummary(ctx: ChatContext): string {
  const parts: string[] = [];
  if (ctx.brandName) parts.push(`brand="${ctx.brandName}"`);
  if (ctx.productName) parts.push(`product="${ctx.productName}"`);
  if (ctx.priceRupees) parts.push(`price=₹${ctx.priceRupees}`);
  if (ctx.originalPriceRupees) parts.push(`originalPrice=₹${ctx.originalPriceRupees}`);
  if (ctx.discountLabel) parts.push(`discount="${ctx.discountLabel}"`);
  if (ctx.pageType) parts.push(`type=${ctx.pageType}`);
  if (ctx.primaryColor) parts.push(`color=${ctx.primaryColor}`);
  if (ctx.secondaryColor) parts.push(`secondaryColor=${ctx.secondaryColor}`);
  if (ctx.productBullets?.length) parts.push(`bullets=${ctx.productBullets.length} set`);
  if (ctx.productImageUrl) parts.push(`photo=uploaded`);
  if (ctx.productUrl) parts.push(`productUrl="${ctx.productUrl}"`);
  if (ctx.variants?.length) parts.push(`variants=${ctx.variants.map((v) => `${v.label}:[${v.options.join(",")}]`).join("; ")}`);
  if (ctx.maxQuantity && ctx.maxQuantity > 1) parts.push(`maxQty=${ctx.maxQuantity}`);
  if (ctx.customFields?.length) parts.push(`customFields=${ctx.customFields.map((f) => f.label).join(", ")}`);
  if (ctx.urgencyEndsAt) parts.push(`urgencyEndsAt=${ctx.urgencyEndsAt}`);
  if (ctx.stockCount != null) parts.push(`stock=${ctx.stockCount}`);
  if (ctx.isPreOrder) parts.push(`isPreOrder=true`);
  if (ctx.deliveryLabel) parts.push(`deliveryLabel="${ctx.deliveryLabel}"`);
  if (ctx.couponCode) parts.push(`coupon=${ctx.couponCode}(${ctx.couponDiscount}%off)`);
  if (ctx.reviewCount) parts.push(`reviews=${ctx.reviewCount}`);
  if (ctx.averageRating) parts.push(`rating=${ctx.averageRating}`);
  if (ctx.deliveryInfo) parts.push(`delivery="${ctx.deliveryInfo}"`);
  if (ctx.socialLinks) {
    const s = ctx.socialLinks;
    if (s.whatsapp) parts.push(`whatsapp=${s.whatsapp}`);
    if (s.instagram) parts.push(`instagram=${s.instagram}`);
    if (s.website) parts.push(`website=${s.website}`);
  }
  if (ctx.language) parts.push(`language=${ctx.language}`);
  if (ctx.collectionProducts?.length) {
    const withPhotos = ctx.collectionProducts.filter((p) => p.imageUrl).length;
    // Cap the inline list at 8 products to avoid oversized prompts; show count for larger collections
    const cap = 8;
    const shown = ctx.collectionProducts.slice(0, cap);
    const productList = shown.map((p) => `${p.name}@₹${p.price}${p.imageUrl ? "(photo✓)" : ""}`).join(", ");
    const overflow = ctx.collectionProducts.length > cap ? ` +${ctx.collectionProducts.length - cap} more` : "";
    parts.push(`collectionProducts=${ctx.collectionProducts.length}:[${productList}${overflow}], productPhotos=${withPhotos}/${ctx.collectionProducts.length}`);
  }
  const summary = parts.join(", ");
  // Hard cap on the total summary length so long names/descriptions can't overflow the prompt
  return summary.length > 2000 ? `${summary.slice(0, 2000)}…` : summary;
}
