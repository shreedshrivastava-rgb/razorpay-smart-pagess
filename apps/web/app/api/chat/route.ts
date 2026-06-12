import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  brandName?: string;
  productName?: string;
  priceRupees?: number;       // stored in rupees, converted to paise when generating
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
  pageType?: string;
  productBullets?: string[];
  productImageUrl?: string;
  productUrl?: string;
}

interface ChatResponse {
  reply: string;
  context: ChatContext;
  action: "ask" | "generate" | "update";
}

// ─── Azure config ─────────────────────────────────────────────────────────────

function getAzureConfig() {
  const key = process.env.AI_API_KEY!;
  const base = (process.env.AI_BASE_URL ?? "").replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? "claude-sonnet-4-6";
  const endpoint = base.endsWith("/anthropic")
    ? `${base}/v1/messages`
    : `${base}/anthropic/v1/messages`;
  return { key, endpoint, model };
}

// ─── System prompt ────────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are a warm, friendly assistant for Razorpay Smart Pages — you help small business owners (home bakers, artisans, food sellers, service providers) create a beautiful payment checkout page in minutes, just by chatting.

You MUST respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "reply": "your conversational response (2-3 sentences max)",
  "context": {
    "brandName": "string or null",
    "productName": "string or null",
    "priceRupees": number_or_null,
    "description": "string or null",
    "primaryColor": "#hex or null",
    "secondaryColor": "#hex or null",
    "pageType": "product|service|course|workshop|event|consultation|saas|subscription or null",
    "productBullets": ["bullet1", "bullet2", "bullet3"] or null
  },
  "action": "ask" | "generate" | "update"
}

CONVERSATION RULES:
- Extract ALL info from what the merchant says — don't ask for something they already mentioned
- Ask MAX ONE follow-up question per response
- Be warm, brief, enthusiastic — like talking to a friend who's helping with their business
- If the merchant pastes a URL, acknowledge it and say you'll extract product info from it

COLOR INFERENCE (when merchant doesn't specify):
- Bakery/cake/food → warm: "#FF6B35" (orange)
- Handmade/artisan/crafts → earthy: "#8B6F47" (warm brown)
- Beauty/fashion → elegant: "#C0A882" (champagne)
- Tech/digital/saas → modern: "#6366F1" (indigo)
- Health/wellness → calm: "#10B981" (emerald)
- Education/courses → trust: "#3B82F6" (blue)
- Events/music → vibrant: "#EC4899" (pink)
- Default: "#6366F1" (indigo)

PAGE TYPE INFERENCE:
- Selling a product (cake, jam, shirt) → "product"
- Offering a service (design, repair, cleaning) → "service"
- Teaching a class or skill → "course" or "workshop"
- Booking a consultation, session → "consultation"
- Selling software → "saas"
- Monthly subscription → "subscription"

BULLET INFERENCE (generate 3 compelling reasons to buy based on the product type if not given):
- Should be 5-10 words, specific benefits, NOT vague fluff
- Examples for a cake brand: ["Made fresh on order", "Custom flavors available", "Delivered same day in Mumbai"]

PHOTO STEP (important — do this before generating):
- Once you have brandName + productName + priceRupees, ask for a product photo BEFORE generating
- Say something like: "Almost ready! Do you have a product photo to add? Tap the 📷 camera icon below to upload one — or just say 'skip' and I'll create the page without it."
- If they upload a photo (context will have productImageUrl), proceed to generate immediately
- If they say "skip", "no photo", "no image", "proceed", "generate", or similar → set action to "generate"
- Never ask for the photo more than once

GENERATION TRIGGER:
- Set action to "generate" when you have: brandName + productName + priceRupees AND (productImageUrl is set OR user has said skip/proceed/no photo)
- If you're missing price and have everything else, you can ask just for price
- If merchant says "generate", "create", "make it", or "let's go" → set action to "generate" with best guesses for missing fields
- For follow-up edits to an already-generated page (merchant says "change price", "make it blue", etc.) → set action to "update"
- If context includes page=live(...), the user is editing an existing page — always return action "update", never "generate"

KEEP CONTEXT CUMULATIVE:
- The context object must include ALL info gathered so far, not just what was in the latest message
- Never null out a field that was previously filled — only update or keep it`;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { messages: ChatMessage[]; context: ChatContext; generatedSlug?: string };
  try {
    body = await req.json() as { messages: ChatMessage[]; context: ChatContext; generatedSlug?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, context, generatedSlug } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const { key, endpoint, model } = getAzureConfig();

  // Include current context in the user message so AI knows what's been gathered
  const baseSummary = buildContextSummary(context);
  const contextSummary = generatedSlug
    ? `${baseSummary}${baseSummary ? ", " : ""}page=live(${generatedSlug})`
    : baseSummary;
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
        max_tokens: 1024,
        system: CHAT_SYSTEM_PROMPT,
        messages: messagesWithContext,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI error: ${res.status}` }, { status: 500 });
    }

    const json = await res.json() as { content: Array<{ type: string; text: string }> };
    const rawText = json.content?.[0]?.text ?? "";

    // Parse the JSON response from the AI
    const jsonText = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(jsonText) as ChatResponse;

    // Merge AI-returned context with existing context (AI context wins, but never clears existing fields)
    const mergedContext: ChatContext = { ...context };
    for (const [k, v] of Object.entries(parsed.context)) {
      if (v !== null && v !== undefined) {
        (mergedContext as Record<string, unknown>)[k] = v;
      }
    }

    return NextResponse.json({
      reply: parsed.reply,
      context: mergedContext,
      action: parsed.action,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}

function buildContextSummary(ctx: ChatContext): string {
  const parts: string[] = [];
  if (ctx.brandName) parts.push(`brand="${ctx.brandName}"`);
  if (ctx.productName) parts.push(`product="${ctx.productName}"`);
  if (ctx.priceRupees) parts.push(`price=₹${ctx.priceRupees}`);
  if (ctx.pageType) parts.push(`type=${ctx.pageType}`);
  if (ctx.primaryColor) parts.push(`color=${ctx.primaryColor}`);
  if (ctx.productBullets?.length) parts.push(`bullets=${ctx.productBullets.length} set`);
  if (ctx.productImageUrl) parts.push(`photo=uploaded`);
  return parts.join(", ");
}
