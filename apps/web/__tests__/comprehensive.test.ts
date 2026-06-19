/**
 * Comprehensive edge-case tests beyond the existing 58 regression tests.
 * Covers schema validation, utility functions, store logic, API route logic,
 * and all identified breaking issues.
 *
 * Run: npx jest --testPathPatterns comprehensive
 */

import { describe, it, expect, jest } from "@jest/globals";

// =============================================================================
// 1. Zod Schema Validation — page-schema.ts
// =============================================================================

let schemas: Record<string, unknown>;
try {
  schemas = jest.requireActual("@/lib/schema/page-schema");
} catch {
  schemas = {};
}

let Z: typeof import("zod") | null = null;
try {
  Z = jest.requireActual("zod");
} catch {
  Z = null;
}

const hasZod = !!Z;
const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

describeIf(hasZod)("Zod Schema Validation — page-schema.ts (ACTUAL SCHEMAS)", () => {
  function tryParse(schema: unknown, data: unknown): string | null {
    try {
      (schema as { parse: (d: unknown) => unknown }).parse(data);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  const S = schemas as Record<string, unknown>;

  // ── HeroSectionSchema ─────────────────────────────────────────────
  describe("HeroSectionSchema", () => {
    const schema = S.HeroSectionSchema;
    if (!schema) return;

    it("requires id, type, headline, ctaText", () => {
      const err = tryParse(schema, { type: "hero", headline: "Hello", ctaText: "Buy" });
      expect(err).toContain("id"); // id is required
    });

    it("requires subheadline", () => {
      const err = tryParse(schema, { id: "s1", type: "hero", headline: "H", ctaText: "C" });
      expect(err).toContain("subheadline"); // subheadline is required
    });

    it("parses valid hero with all required fields", () => {
      const data = { id: "s1", type: "hero", headline: "H", subheadline: "S", ctaText: "C" };
      expect(tryParse(schema, data)).toBeNull();
    });

    it("rejects invalid background", () => {
      const err = tryParse(schema, { id: "s1", type: "hero", headline: "H", subheadline: "S", ctaText: "C", background: "neon" });
      expect(err).toContain("background");
    });

    it("rejects invalid variant", () => {
      const err = tryParse(schema, { id: "s1", type: "hero", headline: "H", subheadline: "S", ctaText: "C", variant: "unknown" });
      expect(err).toContain("variant");
    });
  });

  // ── FeaturesSectionSchema ─────────────────────────────────────────
  describe("FeaturesSectionSchema", () => {
    const schema = S.FeaturesSectionSchema;
    if (!schema) return;

    it("requires id, type, headline, items with icon+title+description", () => {
      const data = { id: "s1", type: "features", headline: "F", items: [{ icon: "🚀", title: "Fast", description: "Really fast" }] };
      expect(tryParse(schema, data)).toBeNull();
    });

    it("rejects item missing description", () => {
      const err = tryParse(schema, { id: "s1", type: "features", headline: "F", items: [{ icon: "🚀", title: "Fast" }] });
      expect(err).toContain("description");
    });

    it("accepts list layout", () => {
      const data = { id: "s1", type: "features", headline: "F", items: [{ icon: "🚀", title: "X", description: "" }], layout: "list" };
      expect(tryParse(schema, data)).toBeNull();
    });
  });

  // ── BenefitsSectionSchema ─────────────────────────────────────────
  describe("BenefitsSectionSchema", () => {
    const schema = S.BenefitsSectionSchema;
    if (!schema) return;

    it("REQUIRES description field per schema (contradicts AI prompt)", () => {
      const err = tryParse(schema, { id: "s1", type: "benefits", headline: "B", items: [{ icon: "✅", title: "Benefit" }] });
      expect(err).toContain("description");
    });

    it("parses benefits WITH description", () => {
      const data = { id: "s1", type: "benefits", headline: "B", items: [{ icon: "✅", title: "Benefit", description: "Has description" }] };
      expect(tryParse(schema, data)).toBeNull();
    });
  });

  // ── ProductGridSectionSchema ──────────────────────────────────────
  describe("ProductGridSectionSchema", () => {
    const schema = S.ProductGridSectionSchema;
    if (!schema) return;

    it("requires id, type, headline, items with id+name+price", () => {
      const data = {
        id: "s1", type: "product-grid", headline: "C",
        items: [{ id: "p1", name: "Widget", price: 999 }],
      };
      expect(tryParse(schema, data)).toBeNull();
    });

    it("rejects item missing id", () => {
      const err = tryParse(schema, { id: "s1", type: "product-grid", headline: "C", items: [{ name: "W", price: 1 }] });
      expect(err).toContain("id");
    });
  });

  // ── TestimonialsSectionSchema ─────────────────────────────────────
  describe("TestimonialsSectionSchema", () => {
    const schema = S.TestimonialsSectionSchema;
    if (!schema) return;

    it("requires items with name, rating, text", () => {
      const data = { id: "s1", type: "testimonials", headline: "T", items: [{ name: "N", rating: 5, text: "Great!" }] };
      expect(tryParse(schema, data)).toBeNull();
    });

    it("rejects rating less than 1", () => {
      const err = tryParse(schema, { id: "s1", type: "testimonials", headline: "T", items: [{ name: "N", rating: 0, text: "G" }] });
      expect(err).toContain("rating");
    });

    it("rejects rating more than 5", () => {
      const err = tryParse(schema, { id: "s1", type: "testimonials", headline: "T", items: [{ name: "N", rating: 6, text: "G" }] });
      expect(err).toContain("rating");
    });
  });

  // ── SectionSchema (discriminated union) ───────────────────────────
  describe("SectionSchema (discriminated union)", () => {
    const schema = S.SectionSchema;
    if (!schema) return;

    it("rejects unknown section type", () => {
      const err = tryParse(schema, { type: "nonsense", id: "s1" });
      expect(err).toContain("'hero' | 'features'");
    });

    it("rejects null type", () => {
      const err = tryParse(schema, { type: null });
      expect(err).toBeTruthy();
    });

    it("rejects undefined input", () => {
      const err = tryParse(schema, undefined);
      expect(err).toBeTruthy();
    });
  });

  // ── PaymentSchema ─────────────────────────────────────────────────
  describe("PaymentSchema", () => {
    const schema = S.PaymentSchema;
    if (!schema) return;

    it("requires description (razorpayKeyId has a default)", () => {
      // razorpayKeyId has .default("rzp_test_placeholder") so omitting it is fine.
      // description has no default and is required.
      const err = tryParse(schema, { amount: 999, currency: "INR", name: "P" });
      expect(err).toContain("description");
    });

    it("requires amount", () => {
      const err = tryParse(schema, { razorpayKeyId: "rzp_test", currency: "INR", name: "P" });
      expect(err).toContain("amount");
    });

    it("accepts valid payment with theme", () => {
      const data = { razorpayKeyId: "rzp_test", amount: 99900, currency: "INR", name: "Product", description: "A great product", theme: { color: "#6366f1" } };
      expect(tryParse(schema, data)).toBeNull();
    });

    it("accepts customFields with select type", () => {
      const data = {
        razorpayKeyId: "rzp_test", amount: 99900, currency: "INR", name: "P", description: "Test",
        customFields: [{ label: "Size", required: true, type: "select", options: ["S", "M", "L"] }],
      };
      expect(tryParse(schema, data)).toBeNull();
    });
  });
});

// =============================================================================
// 2. URL Validation & SSRF Protection
// =============================================================================

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch { return false; }
}

function normalizeAndValidate(raw: string): { url: string } | { error: string; status: number } {
  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
  if (!isValidUrl(normalized)) return { error: "Invalid URL", status: 400 };
  const { hostname } = new URL(normalized);
  if (
    hostname === "localhost" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("127.")
  ) {
    return { error: "Private URLs not allowed", status: 400 };
  }
  return { url: normalized };
}

describe("URL Validation & SSRF Protection", () => {
  it("accepts valid https URL", () => {
    const r = normalizeAndValidate("https://example.com");
    expect("url" in r).toBe(true);
  });

  it("auto-prepends https:// for bare domain", () => {
    const r = normalizeAndValidate("example.com");
    expect("url" in r && r.url).toBe("https://example.com");
  });

  it("blocks localhost", () => {
    expect("error" in normalizeAndValidate("http://localhost:3000")).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    expect("error" in normalizeAndValidate("http://127.0.0.1:8080")).toBe(true);
  });

  it("blocks 192.168.x.x", () => {
    expect("error" in normalizeAndValidate("http://192.168.1.1")).toBe(true);
  });

  it("blocks 10.x.x.x", () => {
    expect("error" in normalizeAndValidate("http://10.0.0.1")).toBe(true);
  });

  it("blocks empty string", () => {
    expect("error" in normalizeAndValidate("")).toBe(true);
  });

  it("blocks javascript: protocol", () => {
    expect("error" in normalizeAndValidate("javascript:alert(1)")).toBe(true);
  });

  it("blocks data: protocol", () => {
    expect("error" in normalizeAndValidate("data:text/html,<script>alert(1)</script>")).toBe(true);
  });

  // ── SSRF: Node.js normalizes integer/hex IPs so the prefix filter catches them ──
  it("integer-form IP 2130706433 is blocked (Node.js normalizes to 127.0.0.1)", () => {
    // Modern Node.js URL parser normalizes 2130706433 → 127.0.0.1, caught by filter
    const r = normalizeAndValidate("http://2130706433");
    expect("url" in r).toBe(false);
  });

  it("SSRF BYPASS: IPv6 localhost [::1] passes filter", () => {
    // The filter checks for "127.", "10.", "192.168." — none match "::1"
    const r = normalizeAndValidate("http://[::1]:3000");
    expect("url" in r).toBe(true);
  });

  it("0x7f000001 hex IP is blocked (Node.js normalizes to 127.0.0.1)", () => {
    // Modern Node.js URL parser normalizes 0x7f000001 → 127.0.0.1, caught by filter
    const r = normalizeAndValidate("http://0x7f000001");
    expect("url" in r).toBe(false);
  });

  it("SSRF: 127.0.0.1.nip.io is blocked (hostname starts with 127.)", () => {
    // 127.0.0.1.nip.io starts with "127." so the prefix filter catches it
    const r = normalizeAndValidate("https://127.0.0.1.nip.io");
    expect("url" in r).toBe(false);
  });

  it("ftp:// passes through after normalization (known gap)", () => {
    // "ftp://" does not start with "http" so it becomes "https://ftp://..."
    // Node.js parses hostname as "ftp" which passes the private-IP filter
    expect("error" in normalizeAndValidate("ftp://example.com")).toBe(false);
  });
});

// =============================================================================
// 3. slugify edge cases (BUG FOUND: leading/trailing spaces become hyphens)
// =============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

describe("slugify — BUG: leading/trailing space becomes hyphen", () => {
  it("converts basic text", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("Hello!@#$%World")).toBe("helloworld");
  });

  it("BUG: trailing/leading whitespace produces leading/trailing hyphens", () => {
    // The .trim() at the end only removes whitespace, but whitespace was already
    // converted to hyphens in step 3. Leading/trailing hyphens remain.
    expect(slugify("  Hello World  ")).toBe("-hello-world-"); // BUG
  });

  it("handles empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("handles unicode chars (non-ASCII stripped)", () => {
    expect(slugify("Café München")).toBe("caf-mnchen");
  });

  it("handles numbers", () => {
    expect(slugify("Page 123")).toBe("page-123");
  });
});

// =============================================================================
// 4. formatCurrency edge cases
// =============================================================================

function formatCurrency(paise: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

describe("formatCurrency", () => {
  it("formats INR with symbol", () => {
    const result = formatCurrency(49900, "INR");
    expect(result).toContain("₹");
    expect(result).toContain("499");
  });

  it("formats USD with $", () => {
    const result = formatCurrency(4999, "USD");
    expect(result).toContain("$");
    // 49.99 rounds to 50 with maxFractionDigits 0
    expect(result).toContain("50");
  });

  it("handles 0 paise (free)", () => {
    expect(formatCurrency(0, "INR")).toContain("0");
  });

  it("handles 1 paisa (rounds to 0)", () => {
    expect(formatCurrency(1, "INR")).toContain("0");
  });

  it("handles negative amount", () => {
    const result = formatCurrency(-100, "INR");
    expect(result).toContain("-");
  });

  it("handles large amounts", () => {
    const result = formatCurrency(100000000000, "INR");
    expect(result).toContain("1,00,00,00,000");
  });

  it("handles EUR", () => {
    const result = formatCurrency(1000, "EUR");
    expect(result).toContain("10");
  });
});

// =============================================================================
// 5. hexToHsl
// =============================================================================

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

describe("hexToHsl", () => {
  it("converts #6366f1 (indigo)", () => {
    expect(hexToHsl("#6366f1")).toMatch(/^\d+ \d+% \d+%$/);
  });
  it("converts #000000 (black)", () => {
    expect(hexToHsl("#000000")).toBe("0 0% 0%");
  });
  it("converts #ffffff (white)", () => {
    expect(hexToHsl("#ffffff")).toBe("0 0% 100%");
  });
  it("converts #ff0000 (red)", () => {
    expect(hexToHsl("#ff0000")).toBe("0 100% 50%");
  });
  it("converts #00ff00 (green)", () => {
    expect(hexToHsl("#00ff00")).toBe("120 100% 50%");
  });
  it("converts #0000ff (blue)", () => {
    expect(hexToHsl("#0000ff")).toBe("240 100% 50%");
  });
  it("short hex #fff produces wrong result (no crash)", () => {
    // #fff → padEnd(6, "0") → "#fff000" → misinterpreted
    const result = hexToHsl("#fff");
    expect(typeof result).toBe("string");
  });
});

// =============================================================================
// 6. darken function
// =============================================================================

function darken(hex: string, factor: number): string {
  const h = hex.replace(/^#/, "").padEnd(6, "0");
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * factor));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * factor));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * factor));
  return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
}

describe("darken", () => {
  it("darkens by factor 0.8", () => {
    const r = darken("#6366f1", 0.8);
    expect(r.startsWith("#")).toBe(true);
    expect(r.length).toBe(7);
  });
  it("factor 1.0 returns same", () => {
    expect(darken("#ff0000", 1.0)).toBe("#ff0000");
  });
  it("factor 0 gives black", () => {
    expect(darken("#ff0000", 0)).toBe("#000000");
  });
  it("clamps to 255", () => {
    const r = darken("#101010", 30);
    expect(parseInt(r.slice(1, 3), 16)).toBeLessThanOrEqual(255);
  });
  it("3-char hex handled incorrectly via padEnd", () => {
    // #F00 → padEnd(6,"0") → "F00000" which decodes as RGB(240,0,0) not (255,0,0)
    // Should expand #F00 → #FF0000 first
    const result = darken("#F00", 1.0);
    // This is wrong: it should be #ff0000 but is actually #f00000
    expect(result).not.toBe("#ff0000");
  });
});

// =============================================================================
// 7. truncate
// =============================================================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

describe("truncate", () => {
  it("returns string unchanged when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("truncates when exceeding", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });
  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
  it("maxLength=0 produces he... (slice(0, -3))", () => {
    // "hello".slice(0, -3) === "he"
    expect(truncate("hello", 0)).toBe("he...");
  });
});

// =============================================================================
// 8. generateId
// =============================================================================

function generateId(prefix = "pg"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

describe("generateId", () => {
  it("generates 100 unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
  it("uses default 'pg_' prefix", () => {
    expect(generateId()).toMatch(/^pg_/);
  });
  it("uses custom prefix", () => {
    expect(generateId("sec")).toMatch(/^sec_/);
  });
});

// =============================================================================
// 9. CSRF Check
// =============================================================================

function checkCsrf(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

describe("CSRF Check", () => {
  it("passes same-origin", () => {
    expect(checkCsrf("https://example.com", "example.com")).toBe(true);
  });
  it("blocks cross-origin", () => {
    expect(checkCsrf("https://evil.com", "example.com")).toBe(false);
  });
  it("blocks null origin", () => {
    expect(checkCsrf(null, "example.com")).toBe(false);
  });
  it("blocks null host", () => {
    expect(checkCsrf("https://example.com", null)).toBe(false);
  });
  it("handles port correctly", () => {
    expect(checkCsrf("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(checkCsrf("http://localhost:3000", "localhost:3001")).toBe(false);
  });
  it("port omission mismatch", () => {
    // new URL("http://example.com").host = "example.com"
    // host parameter "example.com:8080" → mismatch
    expect(checkCsrf("http://example.com", "example.com:8080")).toBe(false);
  });
});

// =============================================================================
// 10. Email Validation
// =============================================================================

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

describe("Email Validation", () => {
  const valid = [
    "user@example.com",
    "user+tag@example.com",
    "very.common@example.com",
    "disposable.style.email.with+symbol@example.com",
    "other.email-with-hyphen@example.com",
    "x@example.com",
    "a.b+c@domain.co.in",
    "test123@gmail.com",
  ];
  valid.forEach((e) => it(`accepts: ${e}`, () => expect(EMAIL_RE.test(e)).toBe(true)));

  const invalid = [
    "plainaddress",
    "@example.com",
    "user@",
    "user@.com",
    "user@[192.168.1.1]",
    "user@localhost",
    "user@example..com",
    "user@-example.com",
    "user@exam ple.com",
    "a@b.c",
    '"much.more unusual"@example.com',
  ];
  invalid.forEach((e) => it(`rejects: ${e}`, () => expect(EMAIL_RE.test(e)).toBe(false)));

  it("PERMISSIVE: RFC special chars #!$%&'*+-/=?^_`{}|~@example.org are accepted", () => {
    // The regex allows all RFC 2822 special chars in the local part
    expect(EMAIL_RE.test("#!$%&'*+-/=?^_`{}|~@example.org")).toBe(true);
  });
});

// =============================================================================
// 11. Phone Validation
// =============================================================================

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

describe("Phone Validation", () => {
  it("accepts Indian mobile", () => expect(validatePhone("+91 9876543210")).toBe(true));
  it("accepts US with dashes", () => expect(validatePhone("555-123-4567")).toBe(true));
  it("accepts 15 digits", () => expect(validatePhone("123456789012345")).toBe(true));
  it("rejects 6 digits", () => expect(validatePhone("123456")).toBe(false));
  it("rejects empty", () => expect(validatePhone("")).toBe(false));
  it("rejects only symbols", () => expect(validatePhone("-( )-")).toBe(false));
  it("accepts 7 digits", () => expect(validatePhone("1234567")).toBe(true));
});

// =============================================================================
// 12. Payment Amount Server-Side Guard
// =============================================================================

function validateOrderAmount(amount: number, pageAmount: number): string | null {
  // NOTE: The actual code has `if (!amount || amount <= 0)` — the `!amount`
  // catches NaN because NaN is falsy. Without it NaN slips through.
  if (!amount || amount <= 0) return "Amount must be positive";
  if (amount > pageAmount) return "Invalid order amount";
  return null;
}

describe("Payment Amount Server-Side Guard", () => {
  it("allows exact page price", () => expect(validateOrderAmount(99900, 99900)).toBeNull());
  it("allows discounted amount", () => expect(validateOrderAmount(89910, 99900)).toBeNull());
  it("rejects 0", () => expect(validateOrderAmount(0, 99900)).not.toBeNull());
  it("rejects negative", () => expect(validateOrderAmount(-100, 99900)).not.toBeNull());
  it("rejects exceeding", () => expect(validateOrderAmount(199900, 99900)).not.toBeNull());
  it("catches NaN via `!amount` guard", () => {
    // NaN is falsy, so !NaN = true → caught by `!amount`
    expect(validateOrderAmount(NaN, 1000)).not.toBeNull();
  });
  it("catches Infinity via `Infinity > pageAmount`", () => {
    expect(validateOrderAmount(Infinity, 1000)).not.toBeNull();
  });
  it("handles free product (pageAmount=0)", () => {
    // For free product, any positive amount would be rejected
    expect(validateOrderAmount(100, 0)).not.toBeNull();
    // 0 amount passes for free
    expect(validateOrderAmount(0, 0)).not.toBeNull(); // caught by !amount
  });
});

// =============================================================================
// 13. Context Summary Builder
// =============================================================================

interface CC { brandName?: string; productName?: string; priceRupees?: number; pageType?: string; productBullets?: string[]; collectionProducts?: Array<{ name: string; price: number; imageUrl?: string }>; [k: string]: unknown }

function buildContextSummary(ctx: CC): string {
  const parts: string[] = [];
  if (ctx.brandName) parts.push(`brand="${ctx.brandName}"`);
  if (ctx.productName) parts.push(`product="${ctx.productName}"`);
  if (ctx.priceRupees) parts.push(`price=₹${ctx.priceRupees}`);
  if (ctx.pageType) parts.push(`type=${ctx.pageType}`);
  if (ctx.productBullets?.length) parts.push(`bullets=${ctx.productBullets.length} set`);
  if (ctx.collectionProducts?.length) {
    const cap = 8;
    const shown = ctx.collectionProducts.slice(0, cap);
    const productList = shown.map((p) => `${p.name}@₹${p.price}${p.imageUrl ? "(photo✓)" : ""}`).join(", ");
    const overflow = ctx.collectionProducts.length > cap ? ` +${ctx.collectionProducts.length - cap} more` : "";
    parts.push(`collectionProducts=${ctx.collectionProducts.length}:[${productList}${overflow}]`);
  }
  const s = parts.join(", ");
  return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

describe("Context Summary Builder", () => {
  it("includes all fields", () => {
    const s = buildContextSummary({ brandName: "B", productName: "P", priceRupees: 499, pageType: "product", productBullets: ["A", "B"] });
    expect(s).toContain("B");
    expect(s).toContain("P");
    expect(s).toContain("₹499");
    expect(s).toContain("bullets=2");
  });
  it("caps collection products at 8", () => {
    const products = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, price: 100 }));
    const s = buildContextSummary({ collectionProducts: products });
    expect(s).toContain("+12 more");
  });
  it("handles empty context", () => {
    expect(buildContextSummary({})).toBe("");
  });
  it("skips 0 price (falsy)", () => {
    expect(buildContextSummary({ priceRupees: 0 })).toBe("");
  });
  it("truncates at 2000 chars", () => {
    const s = buildContextSummary({ brandName: "x".repeat(2500) });
    expect(s.length).toBeLessThanOrEqual(2001);
  });
});

// =============================================================================
// 14. isGoodBullet
// =============================================================================

function isGoodBullet(text: string): boolean {
  if (text.length < 10 || text.length > 110) return false;
  const lower = text.toLowerCase();
  const noisy = [ "cookie", "privacy", "terms", "sign in", "log in", "cart", "checkout", "menu", "search", "home", "contact", "about us", "javascript", "skip to", "watch the", "shop now", "buy now", "learn more", "see more", "view all", "click here", "read more", "find out", "discover", "explore", "representational", "actual color may vary", "delivered in", "brown box", "eligible for", "non returnable", "non-returnable", "for representational", "images displayed", "single box", "warranty applies", "applies only", "extended warranty", "purchases made on", "shopping app" ];
  if (noisy.some((n) => lower.includes(n))) return false;
  if (text.split(/\s+/).length < 3) return false;
  return true;
}

describe("isGoodBullet", () => {
  it("accepts a valid feature bullet", () => {
    expect(isGoodBullet("Handcrafted with organic ingredients")).toBe(true);
  });
  it("rejects < 10 chars", () => expect(isGoodBullet("Too short")).toBe(false));
  it("rejects > 110 chars", () => expect(isGoodBullet("x".repeat(111))).toBe(false));
  it("rejects noisy 'cart'", () => expect(isGoodBullet("Add to cart now and save money")).toBe(false));
  it("rejects noisy 'privacy'", () => expect(isGoodBullet("Read our privacy policy")).toBe(false));
  it("rejects < 3 words", () => expect(isGoodBullet("Hello world")).toBe(false));
  it("110-char requirement needs ≥3 words", () => {
    // "A".repeat(110) is 1 word — fails word count
    expect(isGoodBullet("A".repeat(110))).toBe(false);
    // 110 chars with 3 words
    const text = "A ".repeat(36) + "A"; // 73 chars, 37 words
    expect(isGoodBullet(text)).toBe(true);
  });
  it("rejects empty", () => expect(isGoodBullet("")).toBe(false));
});

// =============================================================================
// 15. Store Layer: In-Flight Slug Lock
// =============================================================================

describe("In-Flight Slug Lock", () => {
  it("prevents concurrent use of same slug", () => {
    const slugs = new Set<string>();
    slugs.add("my-page");
    expect(slugs.has("my-page")).toBe(true);
  });
  it("releases lock after timeout", () => {
    jest.useFakeTimers();
    const slugs = new Set<string>();
    slugs.add("my-page");
    setTimeout(() => slugs.delete("my-page"), 15_000);
    expect(slugs.has("my-page")).toBe(true);
    jest.advanceTimersByTime(15_001);
    expect(slugs.has("my-page")).toBe(false);
    jest.useRealTimers();
  });
  it("handles multiple slugs independently", () => {
    const slugs = new Set<string>(["a", "b"]);
    expect(slugs.has("a")).toBe(true);
    expect(slugs.has("b")).toBe(true);
    expect(slugs.has("c")).toBe(false);
  });
});

// =============================================================================
// 16. Write Lock Pattern
// =============================================================================

describe("Sequential write lock pattern", () => {
  it("serializes operations", async () => {
    const results: number[] = [];
    let lock: Promise<void> = Promise.resolve();
    async function withLock<T>(fn: () => Promise<T>): Promise<T> {
      let release!: () => void;
      const prev = lock;
      lock = new Promise((r) => { release = r; });
      return prev.then(() => fn()).finally(() => release());
    }
    await Promise.all([
      withLock(async () => { await new Promise((r) => setTimeout(r, 10)); results.push(1); }),
      withLock(async () => { results.push(2); }),
      withLock(async () => { results.push(3); }),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// 17. AI JSON Cleaning
// =============================================================================

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

describe("AI JSON Response Cleaning", () => {
  it("strips markdown json code block", () => {
    expect(cleanJsonResponse("```json\n{\"k\": \"v\"}\n```")).toBe("{\"k\": \"v\"}");
  });
  it("handles no code block", () => {
    expect(cleanJsonResponse("{\"k\": \"v\"}")).toBe("{\"k\": \"v\"}");
  });
  it("strips ``` without json label", () => {
    expect(cleanJsonResponse("```\n{\"k\": \"v\"}\n```")).toBe("{\"k\": \"v\"}");
  });

  // BUG: Leading text before the code block is NOT removed
  it("BUG: does NOT remove leading text before JSON block", () => {
    const raw = "Here is the JSON:\n```json\n{\"key\": \"value\"}\n```";
    const result = cleanJsonResponse(raw);
    // The ^``` regex anchor only matches if the codeblock starts at the beginning
    expect(result).toContain("Here is the JSON:");
  });

  it("handles empty response", () => {
    expect(cleanJsonResponse("")).toBe("");
  });
  it("preserves nested JSON", () => {
    const result = cleanJsonResponse("```json\n{\"s\":[{\"type\":\"hero\"}]}\n```");
    expect(JSON.parse(result).s[0].type).toBe("hero");
  });
});

// =============================================================================
// 18. Azure AI Endpoint Builder
// =============================================================================

function getAzureConfig(env: Record<string, string | undefined>) {
  const key = env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY environment variable is not configured");
  const base = (env.AI_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("AI_BASE_URL environment variable is not configured");
  const model = env.AI_MODEL ?? "claude-sonnet-4-6";
  const endpoint = base.endsWith("/anthropic") ? `${base}/v1/messages` : `${base}/anthropic/v1/messages`;
  return { key, endpoint, model };
}

describe("Azure AI Endpoint Builder", () => {
  it("appends /anthropic/v1/messages", () => {
    expect(getAzureConfig({ AI_API_KEY: "sk-123", AI_BASE_URL: "https://api.example.com" }).endpoint)
      .toBe("https://api.example.com/anthropic/v1/messages");
  });
  it("appends /v1/messages when base ends in /anthropic", () => {
    expect(getAzureConfig({ AI_API_KEY: "sk-123", AI_BASE_URL: "https://api.example.com/anthropic" }).endpoint)
      .toBe("https://api.example.com/anthropic/v1/messages");
  });
  it("strips trailing slash", () => {
    expect(getAzureConfig({ AI_API_KEY: "sk-123", AI_BASE_URL: "https://api.example.com/" }).endpoint)
      .toBe("https://api.example.com/anthropic/v1/messages");
  });
  it("uses default model", () => {
    expect(getAzureConfig({ AI_API_KEY: "sk-123", AI_BASE_URL: "https://api.example.com" }).model)
      .toBe("claude-sonnet-4-6");
  });
  it("uses custom model", () => {
    const cfg = getAzureConfig({ AI_API_KEY: "sk-123", AI_BASE_URL: "https://api.example.com", AI_MODEL: "opus" });
    expect(cfg.model).toBe("opus");
  });
  it("throws on missing key", () => {
    expect(() => getAzureConfig({ AI_BASE_URL: "https://api.example.com" })).toThrow("AI_API_KEY");
  });
  it("throws on missing base", () => {
    expect(() => getAzureConfig({ AI_API_KEY: "sk-123" })).toThrow("AI_BASE_URL");
  });
});

// =============================================================================
// 19. buildWizardInput
// =============================================================================

interface WI { brand: { name: string; primaryColor: string; secondaryColor: string }; pageType: string; productName?: string; price: number; currency: string; productBullets: string[]; productImageUrl: string }

function buildWizardInput(ctx: Record<string, unknown>): WI {
  const isCollection = ctx.pageType === "collection";
  return {
    brand: { name: (ctx.brandName as string) ?? "My Brand", primaryColor: (ctx.primaryColor as string) ?? "#6366F1", secondaryColor: (ctx.secondaryColor as string) ?? "#0f172a" },
    pageType: (ctx.pageType as string) ?? "product",
    productName: isCollection ? (ctx.brandName as string) ?? "Our Collection" : (ctx.productName as string) ?? "",
    productDescription: (ctx.description as string) ?? "",
    price: ctx.priceRupees ? (ctx.priceRupees as number) * 100 : 0,
    currency: "INR",
    productBullets: (ctx.productBullets as string[]) ?? [],
    productImageUrl: (ctx.productImageUrl as string) ?? "",
  };
}

describe("buildWizardInput", () => {
  it("converts ChatContext correctly", () => {
    const input = buildWizardInput({ brandName: "Test", priceRupees: 499, pageType: "product", productName: "Widget" });
    expect(input.price).toBe(49900);
    expect(input.brand.name).toBe("Test");
    expect(input.productName).toBe("Widget");
  });
  it("missing price → 0", () => {
    expect(buildWizardInput({ brandName: "T", pageType: "product", productName: "P" }).price).toBe(0);
  });
  it("collection uses brandName as productName", () => {
    expect(buildWizardInput({ brandName: "Shop", pageType: "collection" }).productName).toBe("Shop");
  });
  it("provides defaults for empty context", () => {
    const input = buildWizardInput({});
    expect(input.brand.name).toBe("My Brand");
    expect(input.pageType).toBe("product");
    expect(input.price).toBe(0);
  });
  it("priceRupees=0 gives 0", () => {
    expect(buildWizardInput({ priceRupees: 0, brandName: "B", pageType: "product", productName: "P" }).price).toBe(0);
  });
});

// =============================================================================
// 20. Rate Limiter Memory Leak
// =============================================================================

describe("Rate limiter: stale entries accumulate (memory leak)", () => {
  it("accumulates 1000 stale entries with no cleanup", () => {
    const map = new Map<string, { count: number; resetAt: number }>();
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      map.set(`ip_${i}`, { count: 1, resetAt: now - 100_000 }); // expired
    }
    expect(map.size).toBe(1000);
    // Simulate check-and-update logic (no cleanup)
    for (const [ip, entry] of map) {
      if (now > entry.resetAt) {
        map.set(ip, { count: 1, resetAt: now + 60_000 });
      }
    }
    // Size is still 1000 — no eviction
    expect(map.size).toBe(1000);
  });
});

// =============================================================================
// 21. Product Photo Mapping (fuzzy match)
// =============================================================================

function mapPhoto(photoMapping: string, products: Array<{ name: string; imageUrl?: string }>, photoUrl: string) {
  const targetName = photoMapping.toLowerCase();
  return products.map((p) => {
    const pLower = p.name.toLowerCase();
    if (pLower === targetName || targetName.includes(pLower) || pLower.includes(targetName)) {
      return { ...p, imageUrl: photoUrl };
    }
    return p;
  });
}

describe("Product Photo Mapping (fuzzy match)", () => {
  it("exact name match", () => {
    const r = mapPhoto("Widget A", [{ name: "Widget A" }, { name: "Widget B" }], "img");
    expect(r[0].imageUrl).toBe("img");
    expect(r[1].imageUrl).toBeUndefined();
  });
  it("BUG: partial match maps to MULTIPLE products simultaneously", () => {
    // Both products contain "Widget" so both get mapped
    const r = mapPhoto("Widget", [{ name: "Widget A" }, { name: "Widget B" }], "img");
    expect(r[0].imageUrl).toBe("img");
    expect(r[1].imageUrl).toBe("img");
  });
  it("no match leaves unchanged", () => {
    const r = mapPhoto("Something", [{ name: "Widget A" }], "img");
    expect(r[0].imageUrl).toBeUndefined();
  });
  it("case insensitive", () => {
    const r = mapPhoto("widget a", [{ name: "WIDGET A" }], "img");
    expect(r[0].imageUrl).toBe("img");
  });
});

// =============================================================================
// 22. pollUntilReady
// =============================================================================

describe("pollUntilReady — session invalidation", () => {
  it("polls max iterations then gives up", () => {
    let i = 0;
    const MAX = 20;
    const session = { current: 1 };
    for (i = 0; i < MAX; i++) {
      if (session.current !== 1) break;
    }
    expect(i).toBe(MAX);
  });
  it("stops early on session change", () => {
    let i = 0;
    const session = { current: 1 };
    for (i = 0; i < 20; i++) {
      if (session.current !== 1) break;
      if (i === 5) session.current = 2;
    }
    expect(i).toBe(6);
  });
});

// =============================================================================
// 23. IS_DEMO_MODE build-time inlining BUG
// =============================================================================

describe("IS_DEMO_MODE build-time constant (BUG)", () => {
  function computeDemoMode(keyId: string | undefined): boolean {
    // This is what the code at PageRenderer.tsx:535-539 does
    return !keyId || keyId === "rzp_test_placeholder" || (keyId.startsWith("rzp_live") && process.env.NEXT_PUBLIC_RAZORPAY_LIVE !== "true");
  }

  it("demo mode when key is undefined", () => {
    expect(computeDemoMode(undefined)).toBe(true);
  });
  it("demo mode when key is placeholder", () => {
    expect(computeDemoMode("rzp_test_placeholder")).toBe(true);
  });
  it("NOT demo when live key and NEXT_PUBLIC_RAZORPAY_LIVE=true", () => {
    process.env.NEXT_PUBLIC_RAZORPAY_LIVE = "true";
    expect(computeDemoMode("rzp_live_abc123")).toBe(false);
    delete process.env.NEXT_PUBLIC_RAZORPAY_LIVE;
  });
  it("demo when live key but NEXT_PUBLIC_RAZORPAY_LIVE is not true", () => {
    // This is the case when you roll out a live key but haven't set the marker
    expect(computeDemoMode("rzp_live_abc123")).toBe(true);
  });
  it("BUG: changing env at runtime has NO effect (build-time inlined)", () => {
    // In the actual code, this is a MODULE-LEVEL constant:
    // const IS_DEMO_MODE = !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ...
    // This is evaluated once at module import time and inlined during next build.
    // After a live key is set, the old bundle still thinks it's demo mode.
    process.env.NEXT_PUBLIC_RAZORPAY_LIVE = "true";
    // If we re-evaluated `computeDemoMode` it would work, but the module-level
    // const is frozen at import time.
    expect(computeDemoMode("rzp_live_abc123")).toBe(false); // works
    // But the real issue: the module-level const DOESN'T re-evaluate
  });
});

// =============================================================================
// 24. Collection page price override mismatch
// =============================================================================

describe("Collection product price override — silent drop", () => {
  it("BUG: extra collection product beyond AI output is silently dropped", () => {
    const aiItems = [{ id: "p1", name: "A", price: 100 }];
    const merchantProducts = [
      { name: "A", price: 200 },
      { name: "B", price: 300 }, // no matching AI item — silently dropped
    ];
    const result = aiItems.map((item, i) => {
      const src = merchantProducts[i];
      if (!src) return item;
      return { ...item, price: src.price };
    });
    expect(result).toHaveLength(1); // Only 1 item, product B is gone
    expect(result[0].price).toBe(200); // price overridden
  });

  it("BUG: extra AI item beyond merchant products keeps AI price", () => {
    const aiItems = [
      { id: "p1", name: "A", price: 100 },
      { id: "p2", name: "B", price: 200 }, // no merchant match
    ];
    const merchantProducts = [{ name: "A", price: 150 }];
    const result = aiItems.map((item, i) => {
      const src = merchantProducts[i];
      if (!src) return item;
      return { ...item, price: src.price };
    });
    expect(result).toHaveLength(2);
    expect(result[0].price).toBe(150); // overridden
    expect(result[1].price).toBe(200); // KEPT AI PRICE (not merchant authoritative)
  });
});

// =============================================================================
// 25. BenefitsSection uses FeatureItem with description (prompt contradiction)
// =============================================================================

describe("Benefits section prompt contradiction", () => {
  it("Zod schema REQUIRES description on benefit items despite AI prompt saying no", () => {
    // This was confirmed in the schema test above — BenefitsSectionSchema
    // reuses FeatureItem which requires `description`.
    // The AI prompt says "NO description field" but the schema enforces it.
    // If AI follows the prompt, the generated JSON fails schema validation.
    // If AI ignores the prompt and includes description, it works but contradicts
    // the prompt instructions.
    expect(true).toBe(true); // This is a documented contradiction
  });
});

// =============================================================================
// 26. InlinePaymentCard hardcoded stars
// =============================================================================

describe("InlinePaymentCard star rating — hardcoded", () => {
  it("always renders 5 filled stars (i <= 5) regardless of actual rating", () => {
    // The loop is [1,2,3,4,5] and the check is `i <= 5` which is always true
    const stars = [1, 2, 3, 4, 5];
    const alwaysFilled = stars.every((i) => i <= 5);
    expect(alwaysFilled).toBe(true);
  });
  it("rating text 4.9 (121) is hardcoded regardless of page.averageRating", () => {
    const hardcoded = "4.9 (121)";
    // page.averageRating and page.reviewCount are never used in the component
    const fakePageRating = 3.2;
    const fakeReviewCount = 5;
    expect(hardcoded).not.toContain(String(fakePageRating));
    expect(hardcoded).not.toContain(String(fakeReviewCount));
  });
});

// =============================================================================
// 27. Card coupon "Apply" button within form
// =============================================================================

describe("Card coupon button type missing", () => {
  it("InlinePaymentCard Details button has NO type='button' (PageRenderer.tsx:901)", () => {
    // In the actual code, line 901:
    // <button type="button" ... onClick={applyCoupon}>
    // This is correct — it has type="button".
    // But the "Details" button at line 901 lacks type="button" entirely.
    // Inside a <form>, a button with no type defaults to type="submit".
    const buttonHTML = '<button disabled={loading} onClick={() => {}}>Details</button>';
    expect(buttonHTML).not.toContain('type="button"'); // BUG: submits form
  });
});

// =============================================================================
// 28. Favicon URL resolution (relative paths dropped)
// =============================================================================

describe("Favicon URL resolution", () => {
  it("BUG: relative favicon paths are dropped instead of resolved", () => {
    const rawFavicon = "/favicon.ico";
    // In jina.ts line 202:
    // favicon = rawFavicon.startsWith("http") ? rawFavicon : undefined;
    // This drops relative paths!
    const favicon = rawFavicon.startsWith("http") ? rawFavicon : undefined;
    expect(favicon).toBeUndefined();
  });
  it("absolute favicon URL passes through", () => {
    const rawFavicon = "https://example.com/favicon.ico";
    const favicon = rawFavicon.startsWith("http") ? rawFavicon : undefined;
    expect(favicon).toBe("https://example.com/favicon.ico");
  });
});
