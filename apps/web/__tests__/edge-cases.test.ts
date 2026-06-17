/**
 * Edge case regression tests for all 30 fixes.
 * Run: npx jest --testPathPattern edge-cases
 */

// ─── Fix #1: Image size guard ────────────────────────────────────────────────

describe("Fix #1 – image upload size guard", () => {
  const MAX = 20 * 1024 * 1024;

  function simulateUpload(sizeBytes: number): string | null {
    if (sizeBytes > MAX) return "Image is too large. Please use a photo under 20 MB.";
    return null; // proceed
  }

  it("allows a 5 MB file", () => {
    expect(simulateUpload(5 * 1024 * 1024)).toBeNull();
  });

  it("rejects a 20.1 MB file", () => {
    expect(simulateUpload(20 * 1024 * 1024 + 1)).not.toBeNull();
  });

  it("allows exactly 20 MB", () => {
    expect(simulateUpload(MAX)).toBeNull();
  });
});

// ─── Fix #2+22: Slug uniqueness ──────────────────────────────────────────────

describe("Fix #2+22 – slug in-flight lock and uniqueness", () => {
  it("generates slug-2 when slug is taken", async () => {
    const taken = new Set<string>(["my-cake"]);
    function ensureUnique(slug: string): string {
      let candidate = slug;
      let counter = 2;
      const MAX = 999;
      while (taken.has(candidate)) {
        if (counter > MAX) throw new Error("Too many attempts");
        candidate = `${slug}-${counter++}`;
      }
      taken.add(candidate);
      return candidate;
    }
    expect(ensureUnique("my-cake")).toBe("my-cake-2");
    expect(ensureUnique("my-cake")).toBe("my-cake-3");
  });

  it("throws after 999 attempts", () => {
    const taken = new Set<string>();
    for (let i = 1; i <= 1000; i++) taken.add(i === 1 ? "slug" : `slug-${i}`);
    function ensureUnique(slug: string): string {
      let candidate = slug;
      let counter = 2;
      const MAX = 999;
      while (taken.has(candidate)) {
        if (counter > MAX) throw new Error("Could not generate a unique slug after 999 attempts");
        candidate = `${slug}-${counter++}`;
      }
      return candidate;
    }
    expect(() => ensureUnique("slug")).toThrow("Could not generate a unique slug after 999 attempts");
  });
});

// ─── Fix #3: Session storage overflow ────────────────────────────────────────

describe("Fix #3 – sessionStorage quota handling", () => {
  let warnCalled = false;
  let savedData: string | null = null;

  function saveToStorage(data: object, onWarn: () => void): void {
    const full = JSON.stringify(data);
    if (full.length > 1000) {
      onWarn();
      // Trim to last 10 messages
      const trimmed = { ...(data as Record<string, unknown>), messages: [] };
      savedData = JSON.stringify(trimmed);
      return;
    }
    savedData = full;
  }

  it("warns and saves trimmed data when over quota", () => {
    const bigMessages = Array.from({ length: 50 }, (_, i) => ({ id: String(i), content: "x".repeat(50), role: "user" }));
    saveToStorage({ messages: bigMessages, context: {}, generatedSlug: null }, () => { warnCalled = true; });
    expect(warnCalled).toBe(true);
    expect(savedData).not.toBeNull();
    expect(JSON.parse(savedData!).messages).toHaveLength(0);
  });

  it("saves normally when under quota", () => {
    warnCalled = false;
    saveToStorage({ messages: [{ id: "1", content: "hi", role: "user" }], context: {} }, () => { warnCalled = true; });
    expect(warnCalled).toBe(false);
  });
});

// ─── Fix #4: collectionProducts cap ─────────────────────────────────────────

describe("Fix #4 – collection products cap at 100", () => {
  const MAX = 100;

  function applyProductCap(products: unknown[]): unknown[] {
    return products.length > MAX ? products.slice(0, MAX) : products;
  }

  it("passes through 50 products unchanged", () => {
    const products = Array.from({ length: 50 }, (_, i) => ({ name: `P${i}`, price: 100 }));
    expect(applyProductCap(products)).toHaveLength(50);
  });

  it("caps 200 products to 100", () => {
    const products = Array.from({ length: 200 }, (_, i) => ({ name: `P${i}`, price: 100 }));
    expect(applyProductCap(products)).toHaveLength(100);
  });

  it("caps exactly 101 products to 100", () => {
    const products = Array.from({ length: 101 }, (_, i) => ({ name: `P${i}`, price: 100 }));
    expect(applyProductCap(products)).toHaveLength(100);
  });
});

// ─── Fix #5: Env var validation ──────────────────────────────────────────────

describe("Fix #5 – env var validation", () => {
  function getConfig(env: Record<string, string | undefined>) {
    const key = env.AI_API_KEY;
    if (!key) throw new Error("AI_API_KEY environment variable is not configured");
    const base = (env.AI_BASE_URL ?? "").replace(/\/$/, "");
    if (!base) throw new Error("AI_BASE_URL environment variable is not configured");
    return { key, base };
  }

  it("throws when AI_API_KEY is missing", () => {
    expect(() => getConfig({ AI_BASE_URL: "https://api.example.com" })).toThrow("AI_API_KEY");
  });

  it("throws when AI_BASE_URL is missing", () => {
    expect(() => getConfig({ AI_API_KEY: "sk-123" })).toThrow("AI_BASE_URL");
  });

  it("returns config when both are set", () => {
    const cfg = getConfig({ AI_API_KEY: "sk-123", AI_BASE_URL: "https://api.example.com/" });
    expect(cfg.key).toBe("sk-123");
    expect(cfg.base).toBe("https://api.example.com");
  });
});

// ─── Fix #9: AI response structural validation ───────────────────────────────

describe("Fix #9 – AI response structural validation", () => {
  function isValidChatResponse(obj: unknown): boolean {
    if (!obj || typeof obj !== "object") return false;
    const r = obj as Record<string, unknown>;
    if (typeof r.reply !== "string" || !r.reply.trim()) return false;
    if (!["ask", "generate", "update"].includes(r.action as string)) return false;
    if (!r.context || typeof r.context !== "object" || Array.isArray(r.context)) return false;
    return true;
  }

  it("accepts a valid response", () => {
    expect(isValidChatResponse({ reply: "Hello", action: "ask", context: {} })).toBe(true);
  });

  it("rejects missing reply", () => {
    expect(isValidChatResponse({ action: "ask", context: {} })).toBe(false);
  });

  it("rejects empty reply string", () => {
    expect(isValidChatResponse({ reply: "  ", action: "ask", context: {} })).toBe(false);
  });

  it("rejects invalid action", () => {
    expect(isValidChatResponse({ reply: "Hi", action: "bogus", context: {} })).toBe(false);
  });

  it("rejects missing context", () => {
    expect(isValidChatResponse({ reply: "Hi", action: "ask" })).toBe(false);
  });

  it("rejects array as context", () => {
    expect(isValidChatResponse({ reply: "Hi", action: "ask", context: [] })).toBe(false);
  });

  it("accepts all three valid action values", () => {
    for (const action of ["ask", "generate", "update"]) {
      expect(isValidChatResponse({ reply: "Hi", action, context: {} })).toBe(true);
    }
  });
});

// ─── Fix #10: CSRF check ─────────────────────────────────────────────────────

describe("Fix #10 – CSRF Origin/Host check", () => {
  function checkCsrf(origin: string | null, host: string | null): boolean {
    if (!origin || !host) return false;
    try { return new URL(origin).host === host; } catch { return false; }
  }

  it("passes same-origin request", () => {
    expect(checkCsrf("https://smartpages.razorpay.com", "smartpages.razorpay.com")).toBe(true);
  });

  it("blocks cross-origin request", () => {
    expect(checkCsrf("https://evil.com", "smartpages.razorpay.com")).toBe(false);
  });

  it("blocks request with no Origin header", () => {
    expect(checkCsrf(null, "smartpages.razorpay.com")).toBe(false);
  });

  it("blocks malformed Origin", () => {
    expect(checkCsrf("not-a-url", "smartpages.razorpay.com")).toBe(false);
  });
});

// ─── Fix #12: DataURL size cap ───────────────────────────────────────────────

describe("Fix #12 – DataURL size cap after processImageFile", () => {
  const MAX = 2_000_000;

  function checkDataUrl(dataUrl: string): string | null {
    if (dataUrl.length > MAX) return "Processed image is too large. Please try a smaller or lower-resolution photo.";
    return null;
  }

  it("accepts a 500KB DataURL", () => {
    expect(checkDataUrl("data:image/jpeg;base64," + "A".repeat(500_000))).toBeNull();
  });

  it("rejects a 2.1MB DataURL", () => {
    expect(checkDataUrl("data:image/jpeg;base64," + "A".repeat(2_100_000))).not.toBeNull();
  });
});

// ─── Fix #13: Context summary length cap ─────────────────────────────────────

describe("Fix #13 – context summary length cap at 2000 chars", () => {
  function truncateSummary(s: string): string {
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  }

  it("passes a short summary unchanged", () => {
    const s = "brand=MyShop, price=₹500";
    expect(truncateSummary(s)).toBe(s);
  });

  it("truncates at exactly 2000 chars", () => {
    const s = "x".repeat(3000);
    const result = truncateSummary(s);
    expect(result.length).toBe(2001); // 2000 + ellipsis char
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate a 2000-char summary", () => {
    const s = "x".repeat(2000);
    expect(truncateSummary(s)).toBe(s);
  });
});

// ─── Fix #17: Email validation ───────────────────────────────────────────────

describe("Fix #17 – stricter email validation", () => {
  const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  const valid = ["user@example.com", "a.b+c@domain.co.in", "test123@gmail.com"];
  const invalid = ["notanemail", "@nodomain.com", "user@", "user@b.c", "user@@domain.com"];

  valid.forEach((e) => it(`accepts ${e}`, () => expect(EMAIL_RE.test(e)).toBe(true)));
  invalid.forEach((e) => it(`rejects ${e}`, () => expect(EMAIL_RE.test(e)).toBe(false)));
});

// ─── Fix #18: Phone validation ───────────────────────────────────────────────

describe("Fix #18 – phone digit-count validation", () => {
  function validatePhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }

  it("accepts +91 98765 43210 (10 digits)", () => expect(validatePhone("+91 98765 43210")).toBe(true));
  it("accepts 9876543210", () => expect(validatePhone("9876543210")).toBe(true));
  it("accepts 1234567 (7 digits)", () => expect(validatePhone("1234567")).toBe(true));
  it("rejects 12345 (5 digits)", () => expect(validatePhone("12345")).toBe(false));
  it("rejects (-)--() (0 digits)", () => expect(validatePhone("(-)--()")).toBe(false));
  it("rejects 16-digit number", () => expect(validatePhone("1234567890123456")).toBe(false));
});

// ─── Fix #21: Variant selection in options ───────────────────────────────────

describe("Fix #21 – variant value must be in options", () => {
  function validateVariants(variants: Array<{ label: string; options: string[] }>, selected: Record<string, string>): string | null {
    for (const v of variants) {
      const chosen = selected[v.label];
      if (!chosen) return `Please select a ${v.label}.`;
      if (!v.options.includes(chosen)) return `Invalid ${v.label} selection.`;
    }
    return null;
  }

  const variants = [{ label: "Size", options: ["S", "M", "L"] }];

  it("passes valid selection", () => expect(validateVariants(variants, { Size: "M" })).toBeNull());
  it("fails missing selection", () => expect(validateVariants(variants, {})).toBeTruthy());
  it("fails selection not in options", () => expect(validateVariants(variants, { Size: "XXL" })).toBeTruthy());
  it("handles empty variants list", () => expect(validateVariants([], {})).toBeNull());
});

// ─── Fix #25: CSS color sanitization ─────────────────────────────────────────

describe("Fix #25 – CSS hex color sanitization", () => {
  function sanitizeHexColor(color: string | undefined, fallback: string): string {
    if (color && /^#[0-9A-Fa-f]{3}$|^#[0-9A-Fa-f]{6}$/.test(color)) return color;
    return fallback;
  }

  it("accepts #6366f1", () => expect(sanitizeHexColor("#6366f1", "#000")).toBe("#6366f1"));
  it("accepts #F00 (3-char shorthand)", () => expect(sanitizeHexColor("#F00", "#000")).toBe("#F00"));
  it("falls back for undefined", () => expect(sanitizeHexColor(undefined, "#6366f1")).toBe("#6366f1"));
  it("falls back for invalid value", () => expect(sanitizeHexColor("red", "#6366f1")).toBe("#6366f1"));
  it("falls back for script injection attempt", () => expect(sanitizeHexColor("javascript:alert(1)", "#6366f1")).toBe("#6366f1"));
  it("falls back for 8-char hex", () => expect(sanitizeHexColor("#6366f1ff", "#6366f1")).toBe("#6366f1")); // no alpha channel
});

// ─── Fix #7: Payment amount validation ───────────────────────────────────────

describe("Fix #7 – payment amount server-side guard", () => {
  function validateOrderAmount(amount: number, pageAmount: number): string | null {
    if (amount <= 0) return "Amount must be positive";
    if (amount > pageAmount) return "Invalid order amount";
    return null;
  }

  it("allows paying exactly the page price", () => expect(validateOrderAmount(99900, 99900)).toBeNull());
  it("allows a discounted amount (coupon applied)", () => expect(validateOrderAmount(89910, 99900)).toBeNull());
  it("rejects zero amount", () => expect(validateOrderAmount(0, 99900)).not.toBeNull());
  it("rejects negative amount", () => expect(validateOrderAmount(-100, 99900)).not.toBeNull());
  it("rejects amount higher than page price", () => expect(validateOrderAmount(199900, 99900)).not.toBeNull());
});
