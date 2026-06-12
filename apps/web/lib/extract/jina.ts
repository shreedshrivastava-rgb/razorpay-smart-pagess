import type { ExtractedBrand } from "@/lib/schema/page-schema";

// ─── Product extraction (GET /api/extract?url=...) ────────────────
// Returned to Step3Details for "what do you want to feature"
export interface ProductExtract {
  name?: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  price?: string;
  brand?: string;
  primaryColor?: string;
  logo?: string;
  bullets?: string[];   // 3 key selling points
}

export async function extractProduct(url: string): Promise<ProductExtract> {
  // Fetch the raw HTML — fastest and most reliable for metadata
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) html = await res.text();
  } catch {
    // If direct fetch fails, fall back to Jina
  }

  // 1. Try JSON-LD Product schema (richest source — Shopify, WooCommerce, most e-commerce)
  const jsonldProduct = extractJsonLdProduct(html);

  // 2. Extract OG + meta tags
  const meta = extractMeta(html);

  // 3. Always fetch Jina for bullet extraction + image fallback
  let jinaContent = "";
  try {
    const jina = await fetchWithJina(url);
    jinaContent = jina.content;
  } catch {
    // ignore — bullets will fall back to HTML extraction
  }

  const jinaImages = extractImagesFromMarkdown(jinaContent);

  const name =
    jsonldProduct.name ||
    meta.ogTitle?.split(/\s*[-|–|·]\s*/)[0]?.trim() ||
    meta.title?.split(/\s*[-|–|·]\s*/)[0]?.trim() ||
    "";

  const description =
    jsonldProduct.description ||
    meta.ogDescription ||
    meta.description ||
    "";

  // Collect all candidate images, best-quality first
  const allImages = [
    jsonldProduct.image,
    meta.ogImage,
    ...jinaImages,
  ].filter((s): s is string => !!s && isLikelyProductImage(s));

  const imageUrl = allImages[0] ?? "";

  const price =
    jsonldProduct.price
      ? formatPrice(jsonldProduct.price, jsonldProduct.priceCurrency)
      : meta.ogPrice ?? "";

  const logo =
    meta.favicon ||
    `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`;

  // Extract feature bullets: HTML <li> items first, then Jina markdown list lines
  const bullets = extractBullets(html, jinaContent, description);

  return {
    name,
    description: description.slice(0, 300),
    imageUrl,
    images: allImages.slice(0, 6),
    price,
    brand: jsonldProduct.brand || meta.siteName,
    primaryColor: meta.themeColor,
    logo,
    bullets,
  };
}

// ─── JSON-LD extraction ───────────────────────────────────────────
interface JsonLdProduct {
  name?: string;
  description?: string;
  image?: string;
  price?: string;
  priceCurrency?: string;
  brand?: string;
}

function extractJsonLdProduct(html: string): JsonLdProduct {
  const scriptBlocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  ) ?? [];

  for (const block of scriptBlocks) {
    const inner = block.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
    try {
      const data = JSON.parse(inner) as Record<string, unknown>;

      // Handle @graph arrays
      const candidates: Record<string, unknown>[] = [];
      if (Array.isArray((data as { "@graph"?: unknown[] })["@graph"])) {
        candidates.push(...((data["@graph"] as Record<string, unknown>[]) ?? []));
      } else {
        candidates.push(data);
      }

      for (const item of candidates) {
        const type = (item["@type"] as string | undefined) ?? "";
        if (
          type === "Product" ||
          type === "IndividualProduct" ||
          type === "SomeProducts"
        ) {
          // Extract image — can be string, array, or ImageObject
          let image: string | undefined;
          const rawImage = item.image;
          if (typeof rawImage === "string") image = rawImage;
          else if (Array.isArray(rawImage)) {
            const first = rawImage[0];
            image = typeof first === "string" ? first : (first as { url?: string })?.url;
          } else if (rawImage && typeof rawImage === "object") {
            image = (rawImage as { url?: string }).url;
          }

          // Extract price
          let price: string | undefined;
          let priceCurrency: string | undefined;
          const offers = item.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            price = String(offer?.price ?? "");
            priceCurrency = String(offer?.priceCurrency ?? "");
          }

          return {
            name: item.name as string | undefined,
            description: item.description as string | undefined,
            image,
            price,
            priceCurrency,
            brand:
              typeof item.brand === "string"
                ? item.brand
                : (item.brand as { name?: string } | undefined)?.name,
          };
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return {};
}

// ─── OG + meta tag extraction ─────────────────────────────────────
interface MetaTags {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogPrice?: string;
  siteName?: string;
  themeColor?: string;
  favicon?: string;
}

function extractMeta(html: string): MetaTags {
  const get = (patterns: RegExp[]): string | undefined => {
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return m[1].trim();
    }
  };

  // Resolve relative favicon URL
  const rawFavicon = get([
    /rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  ]);

  let favicon: string | undefined;
  if (rawFavicon) {
    try { favicon = rawFavicon.startsWith("http") ? rawFavicon : undefined; } catch { /* ignore */ }
  }

  return {
    title: get([/<title[^>]*>([^<]+)<\/title>/i]),
    description: get([
      /meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ]),
    ogTitle: get([
      /meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    ]),
    ogDescription: get([
      /meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    ]),
    ogImage: get([
      /meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ]),
    ogPrice: get([
      /meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:price:amount["']/i,
      /meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
    ]),
    siteName: get([
      /meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    ]),
    themeColor: get([
      /meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
      /meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
    ]),
    favicon,
  };
}

// ─── Jina Reader fallback ─────────────────────────────────────────
export async function fetchWithJina(url: string): Promise<{ content: string }> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  return { content: await res.text() };
}

function extractImagesFromMarkdown(markdown: string): string[] {
  const matches = markdown.matchAll(/!\[.*?\]\((https?:\/\/[^)]+)\)/g);
  return Array.from(matches)
    .map((m) => m[1])
    .filter(isLikelyProductImage)
    .slice(0, 6);
}

function isLikelyProductImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("icon") && !lower.includes("product")) return false;
  if (lower.includes("favicon")) return false;
  if (lower.includes("pixel") || lower.includes("track")) return false;
  if (lower.endsWith(".svg") && !lower.includes("product")) return false;
  return true;
}

// ─── Bullet extraction ────────────────────────────────────────────
// Pull 3 concise selling points from HTML <li> items or Jina markdown lists.
// Priority: product description <li> items → Jina markdown list lines → sentence-split description fallback
function extractBullets(html: string, jinaMarkdown: string, fallbackDescription: string): string[] {
  // 1. Try <li> items from product description sections in the HTML
  // Target common product description containers used by Shopify, WooCommerce etc.
  const descSectionPattern =
    /(?:class|id)=["'][^"']*(?:description|feature|highlight|detail|benefit|spec)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|ul|article)/gi;

  const htmlBullets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = descSectionPattern.exec(html)) !== null) {
    const block = m[1];
    const liMatches = block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    for (const li of liMatches) {
      // Strip nested HTML tags and decode entities
      const text = li[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (isGoodBullet(text)) htmlBullets.push(text);
    }
    if (htmlBullets.length >= 6) break;
  }

  if (htmlBullets.length >= 3) return htmlBullets.slice(0, 3);

  // 2. Jina markdown list lines (- text or * text)
  const jinaBullets: string[] = [];
  for (const line of jinaMarkdown.split("\n")) {
    const text = line.replace(/^[-*]\s+/, "").trim();
    if (isGoodBullet(text)) jinaBullets.push(text);
    if (jinaBullets.length >= 6) break;
  }

  if (jinaBullets.length >= 3) return jinaBullets.slice(0, 3);

  // 3. Combine what we have
  const combined = [...htmlBullets, ...jinaBullets].slice(0, 3);
  if (combined.length >= 2) return combined;

  // 4. Sentence-split the description as last resort
  if (fallbackDescription) {
    const sentences = fallbackDescription
      .split(/[.。!?]+/)
      .map((s) => s.trim())
      .filter((s) => isGoodBullet(s));
    return sentences.slice(0, 3);
  }

  return [];
}

function isGoodBullet(text: string): boolean {
  if (text.length < 10 || text.length > 110) return false;
  const lower = text.toLowerCase();

  // Navigation, CTA, boilerplate, policy — anything that isn't a product feature
  const noisy = [
    "cookie", "privacy", "terms", "sign in", "log in", "cart", "checkout",
    "menu", "search", "home", "contact", "about us", "javascript", "skip to",
    "watch the", "shop now", "buy now", "learn more", "see more", "view all",
    "click here", "read more", "find out", "discover", "explore",
    "representational", "actual color may vary", "delivered in", "brown box",
    "eligible for", "non returnable", "non-returnable", "for representational",
    "images displayed", "single box",
    "warranty applies", "applies only", "extended warranty",
    "purchases made on", "shopping app",
  ];
  if (noisy.some((n) => lower.includes(n))) return false;

  // Must have at least 3 words to be a real feature statement
  if (text.split(/\s+/).length < 3) return false;

  // Prefer bullets that describe features/benefits (contain a noun + descriptor)
  return true;
}

function formatPrice(amount: string, currency?: string): string {
  if (!amount) return "";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  const sym = currency === "INR" ? "₹" : currency === "USD" ? "$" : (currency ?? "");
  return `${sym}${num.toLocaleString("en-IN")}`;
}

// ─── Brand extraction (POST /api/extract — Step1Import) ───────────
export async function extractBrand(url: string): Promise<ExtractedBrand> {
  const [jinaResult, htmlResult] = await Promise.allSettled([
    fetchWithJina(url),
    fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RazorpaySmartPages/1.0)" },
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.text()),
  ]);

  const content = jinaResult.status === "fulfilled" ? jinaResult.value.content : "";
  const html = htmlResult.status === "fulfilled" ? htmlResult.value : "";
  const meta = extractMeta(html);

  const domain = new URL(url).hostname.replace(/^www\./, "");
  const brandName =
    meta.ogTitle?.split(/\s*[-|–|·]\s*/)[0]?.trim() ||
    meta.title?.split(/\s*[-|–|·]\s*/)[0]?.trim() ||
    domain.split(".")[0];

  const jinaImages = extractImagesFromMarkdown(content);
  const allImages = [meta.ogImage, ...jinaImages]
    .filter((s): s is string => !!s)
    .slice(0, 5);

  const logo =
    meta.favicon ||
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  return {
    name: formatBrandName(brandName || ""),
    logo,
    description: meta.description || extractFirstParagraph(content),
    primaryColor: meta.themeColor || "#6366f1",
    images: allImages,
    content: content.slice(0, 8000),
  };
}

function formatBrandName(raw: string): string {
  return raw.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function extractFirstParagraph(markdown: string): string {
  const lines = markdown.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 40 && !t.startsWith("#") && !t.startsWith("!") && !t.startsWith("[");
  });
  return lines[0]?.slice(0, 200) || "";
}
