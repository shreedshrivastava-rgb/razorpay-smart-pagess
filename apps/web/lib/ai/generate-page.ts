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

async function callModel(prompt: string): Promise<string> {
  const { key, endpoint, model } = getAzureConfig();

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
    // Tell Next.js NOT to cache this request
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
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
    throw new Error(`AI returned invalid JSON. Raw: ${jsonText.slice(0, 300)}`);
  }
}

export async function buildFullPage(input: WizardInput): Promise<PageSchema> {
  const generated = await generatePageContent(input);
  const brandName = input.brand.name || input.extracted?.name || "My Page";
  const slug = slugify(`${brandName}-${input.productName}`) || generateId("page");

  return {
    id: generateId("pg"),
    slug,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brand: {
      ...generated.brand,
      logo: input.brand.logo || input.extracted?.logo,
      primaryColor: input.brand.primaryColor || input.extracted?.primaryColor || "#6366f1",
      secondaryColor: input.brand.secondaryColor || "#0f172a",
    },
    template: "modern",
    pageType: input.pageType,
    productImageUrl: input.productImageUrl || input.extracted?.images?.[0],
    productBullets: input.productBullets?.filter(Boolean),
    sections: generated.sections,
    payment: {
      razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
      amount: input.price || 0,
      currency: input.currency || "INR",
      name: input.productName,
      description: input.productDescription,
      theme: {
        color: input.brand.primaryColor || input.extracted?.primaryColor || "#6366f1",
      },
    },
    seo: generated.seo || {
      title: `${input.productName} — ${brandName}`,
      description: input.productDescription,
    },
  };
}
