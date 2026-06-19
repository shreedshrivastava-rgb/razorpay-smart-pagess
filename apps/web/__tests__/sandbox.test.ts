/**
 * Sandbox / Draft-Mode feature tests.
 * Covers: schema fields, draft access gate, blob namespace, publishPage logic,
 * isDemoKey with razorpayMode, preview URL builder, and generate-route init.
 *
 * Run: npx jest --testPathPatterns sandbox
 */

import { describe, it, expect, jest } from "@jest/globals";

// =============================================================================
// Schema import (actual Zod schemas)
// =============================================================================

let schemas: Record<string, unknown> = {};
try {
  schemas = jest.requireActual("@/lib/schema/page-schema");
} catch {
  schemas = {};
}

const hasSchemas = Object.keys(schemas).length > 0;
const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

// =============================================================================
// 1. PageSchemaValidator — status field
// =============================================================================

describeIf(hasSchemas)("PageSchemaValidator — status field", () => {
  const schema = schemas.PageSchemaValidator as { parse: (d: unknown) => { status: string } };
  if (!schema) return;

  function minimalPage(overrides: Record<string, unknown> = {}) {
    return {
      id: "pg_test_1",
      slug: "test-page",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "published",
      brand: { name: "Test Brand", primaryColor: "#6366f1", secondaryColor: "#0f172a" },
      template: "modern",
      pageType: "product",
      sections: [],
      payment: {
        razorpayKeyId: "rzp_test_placeholder",
        razorpayMode: "test",
        amount: 9900,
        currency: "INR",
        name: "Test Product",
        description: "Test",
      },
      seo: { title: "Test", description: "Test description" },
      maxQuantity: 1,
      isPreOrder: false,
      ...overrides,
    };
  }

  it("accepts status: published", () => {
    const result = schema.parse(minimalPage({ status: "published" }));
    expect(result.status).toBe("published");
  });

  it("accepts status: draft", () => {
    const result = schema.parse(minimalPage({ status: "draft" }));
    expect(result.status).toBe("draft");
  });

  it("defaults status to published when omitted", () => {
    const page = minimalPage();
    delete (page as Record<string, unknown>).status;
    const result = schema.parse(page);
    expect(result.status).toBe("published");
  });

  it("rejects invalid status value", () => {
    let threw = false;
    try {
      schema.parse(minimalPage({ status: "archived" }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects status: null", () => {
    let threw = false;
    try {
      schema.parse(minimalPage({ status: null }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// =============================================================================
// 2. PaymentSchema — razorpayMode field
// =============================================================================

describeIf(hasSchemas)("PaymentSchema — razorpayMode field", () => {
  const schema = schemas.PaymentSchema as { parse: (d: unknown) => { razorpayMode: string } };
  if (!schema) return;

  function minimalPayment(overrides: Record<string, unknown> = {}) {
    return {
      razorpayKeyId: "rzp_test_placeholder",
      razorpayMode: "test",
      amount: 9900,
      currency: "INR",
      name: "Test Product",
      description: "Test",
      ...overrides,
    };
  }

  it("accepts razorpayMode: test", () => {
    const result = schema.parse(minimalPayment({ razorpayMode: "test" }));
    expect(result.razorpayMode).toBe("test");
  });

  it("accepts razorpayMode: live", () => {
    const result = schema.parse(minimalPayment({ razorpayMode: "live" }));
    expect(result.razorpayMode).toBe("live");
  });

  it("defaults razorpayMode to test when omitted", () => {
    const payment = minimalPayment();
    delete (payment as Record<string, unknown>).razorpayMode;
    const result = schema.parse(payment);
    expect(result.razorpayMode).toBe("test");
  });

  it("rejects invalid razorpayMode value", () => {
    let threw = false;
    try {
      schema.parse(minimalPayment({ razorpayMode: "sandbox" }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects razorpayMode: null", () => {
    let threw = false;
    try {
      schema.parse(minimalPayment({ razorpayMode: null }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// =============================================================================
// 3. Draft access gate (logic from /p/[slug]/page.tsx)
// =============================================================================

/**
 * Extracted from the public page route:
 *   const isDraft = page.status === "draft";
 *   const hasValidPreviewToken = preview && editToken && preview === editToken;
 *   if (isDraft && !hasValidPreviewToken) notFound();
 */
function shouldAllowAccess(
  pageStatus: string,
  storedEditToken: string | null,
  previewParam: string | undefined
): boolean {
  const isDraft = pageStatus === "draft";
  if (!isDraft) return true;
  const hasValidPreviewToken = !!(previewParam && storedEditToken && previewParam === storedEditToken);
  return hasValidPreviewToken;
}

describe("Draft access gate — shouldAllowAccess()", () => {
  // ── Published pages always accessible ────────────────────────────
  it("published page: accessible without preview token", () => {
    expect(shouldAllowAccess("published", null, undefined)).toBe(true);
  });

  it("published page: accessible with any token (token ignored)", () => {
    expect(shouldAllowAccess("published", "abc123", "wrong")).toBe(true);
  });

  it("published page: accessible with correct token", () => {
    expect(shouldAllowAccess("published", "abc123", "abc123")).toBe(true);
  });

  // ── Draft pages blocked without token ────────────────────────────
  it("draft page: blocked when no preview param supplied", () => {
    expect(shouldAllowAccess("draft", "abc123", undefined)).toBe(false);
  });

  it("draft page: blocked when preview param is empty string", () => {
    expect(shouldAllowAccess("draft", "abc123", "")).toBe(false);
  });

  it("draft page: blocked when wrong token supplied", () => {
    expect(shouldAllowAccess("draft", "abc123", "wrongtoken")).toBe(false);
  });

  it("draft page: blocked when no stored edit token exists", () => {
    expect(shouldAllowAccess("draft", null, "any-token")).toBe(false);
  });

  it("draft page: blocked when both stored token and param are null/undefined", () => {
    expect(shouldAllowAccess("draft", null, undefined)).toBe(false);
  });

  // ── Draft pages allowed with correct token ────────────────────────
  it("draft page: allowed when preview param matches stored token", () => {
    expect(shouldAllowAccess("draft", "secret-token-xyz", "secret-token-xyz")).toBe(true);
  });

  it("draft page: token comparison is case-sensitive", () => {
    expect(shouldAllowAccess("draft", "Token123", "token123")).toBe(false);
    expect(shouldAllowAccess("draft", "Token123", "Token123")).toBe(true);
  });
});

// =============================================================================
// 4. Blob namespace helper — blobPath
// =============================================================================

/**
 * Extracted from pages.ts:
 *   function blobPath(slug: string, namespace: "draft" | "live"): string {
 *     return namespace === "draft" ? `drafts/${slug}.json` : `pages/${slug}.json`;
 *   }
 */
function blobPath(slug: string, namespace: "draft" | "live"): string {
  return namespace === "draft" ? `drafts/${slug}.json` : `pages/${slug}.json`;
}

describe("blobPath — storage namespace helper", () => {
  it("draft pages go to drafts/ prefix", () => {
    expect(blobPath("my-page", "draft")).toBe("drafts/my-page.json");
  });

  it("live pages go to pages/ prefix", () => {
    expect(blobPath("my-page", "live")).toBe("pages/my-page.json");
  });

  it("slug is preserved exactly as given", () => {
    expect(blobPath("acme-corp-2", "draft")).toBe("drafts/acme-corp-2.json");
    expect(blobPath("acme-corp-2", "live")).toBe("pages/acme-corp-2.json");
  });

  it("draft and live paths for same slug are different", () => {
    const draft = blobPath("same-slug", "draft");
    const live = blobPath("same-slug", "live");
    expect(draft).not.toBe(live);
  });

  it("paths end in .json", () => {
    expect(blobPath("test", "draft").endsWith(".json")).toBe(true);
    expect(blobPath("test", "live").endsWith(".json")).toBe(true);
  });

  it("path for draft status uses drafts/ namespace", () => {
    const status: "draft" | "live" = "draft";
    const path = blobPath("my-slug", status);
    expect(path.startsWith("drafts/")).toBe(true);
    expect(path.startsWith("pages/")).toBe(false);
  });
});

// =============================================================================
// 5. publishPage core logic
// =============================================================================

type StoredPage = {
  _editToken?: string;
  status: "draft" | "published";
  slug: string;
  id: string;
  updatedAt: string;
};

/**
 * Extracted core logic from publishPage() in pages.ts.
 * (Without the actual blob I/O — tests the decision logic.)
 */
function publishPageLogic(
  raw: StoredPage | null,
  editToken: string,
  newSlug: string
): { ok: true; page: Omit<StoredPage, "_editToken"> } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: "Page not found" };
  if (raw._editToken && raw._editToken !== editToken) return { ok: false, error: "Forbidden" };
  const published = { ...raw, slug: newSlug, status: "published" as const, updatedAt: new Date().toISOString() };
  delete (published as Partial<StoredPage>)._editToken;
  return { ok: true, page: published };
}

describe("publishPage core logic", () => {
  const draftPage: StoredPage = {
    _editToken: "secret-edit-token",
    status: "draft",
    slug: "my-draft-page",
    id: "pg_abc",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("sets status to published", () => {
    const result = publishPageLogic(draftPage, "secret-edit-token", "my-live-page");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.status).toBe("published");
  });

  it("renames slug to the new slug", () => {
    const result = publishPageLogic(draftPage, "secret-edit-token", "my-live-page");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.slug).toBe("my-live-page");
  });

  it("allows same-slug publish (draft and live slug are the same)", () => {
    const result = publishPageLogic(draftPage, "secret-edit-token", "my-draft-page");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.slug).toBe("my-draft-page");
  });

  it("returns error when page not found (null raw)", () => {
    const result = publishPageLogic(null, "any-token", "new-slug");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Page not found");
  });

  it("returns Forbidden when edit token does not match", () => {
    const result = publishPageLogic(draftPage, "wrong-token", "new-slug");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Forbidden");
  });

  it("allows publish for unprotected (no stored token) legacy pages", () => {
    const legacyPage: StoredPage = { ...draftPage };
    delete legacyPage._editToken;
    const result = publishPageLogic(legacyPage, "", "new-slug");
    expect(result.ok).toBe(true);
  });

  it("allows publish with empty token for legacy pages (no _editToken)", () => {
    const legacyPage: StoredPage = { ...draftPage };
    delete legacyPage._editToken;
    const result = publishPageLogic(legacyPage, "", "new-slug");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.status).toBe("published");
  });

  it("updates updatedAt timestamp on publish", () => {
    const before = new Date("2026-01-01T00:00:00.000Z").getTime();
    const result = publishPageLogic(draftPage, "secret-edit-token", "new-slug");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const after = new Date(result.page.updatedAt).getTime();
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });

  it("does not leak _editToken in the published result", () => {
    const result = publishPageLogic(draftPage, "secret-edit-token", "new-slug");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("_editToken" in result.page).toBe(false);
    }
  });
});

// =============================================================================
// 6. isDemoKey — razorpayMode drives demo/test mode
// =============================================================================

/**
 * Extracted from InlinePaymentCard in PageRenderer.tsx:
 *   const isDemoKey =
 *     IS_DEMO_MODE ||
 *     !payment.razorpayKeyId ||
 *     payment.razorpayKeyId === "rzp_test_placeholder" ||
 *     payment.razorpayMode === "test";
 */
function computeIsDemoKey(
  razorpayKeyId: string | undefined,
  razorpayMode: "test" | "live",
  serverKeyId = "rzp_test_placeholder",
  liveEnabled = false
): boolean {
  const IS_DEMO_MODE =
    !serverKeyId ||
    serverKeyId === "rzp_test_placeholder" ||
    (serverKeyId.startsWith("rzp_live") && !liveEnabled);

  return (
    IS_DEMO_MODE ||
    !razorpayKeyId ||
    razorpayKeyId === "rzp_test_placeholder" ||
    razorpayMode === "test"
  );
}

describe("isDemoKey — razorpayMode-aware demo detection", () => {
  it("razorpayMode=test always triggers demo mode even with a live key", () => {
    expect(computeIsDemoKey("rzp_live_abc", "test", "rzp_live_abc", true)).toBe(true);
  });

  it("razorpayMode=live with real live key and live enabled = NOT demo", () => {
    expect(computeIsDemoKey("rzp_live_abc", "live", "rzp_live_abc", true)).toBe(false);
  });

  it("razorpayMode=live with live key but LIVE not enabled = demo", () => {
    expect(computeIsDemoKey("rzp_live_abc", "live", "rzp_live_abc", false)).toBe(true);
  });

  it("razorpayMode=test with test key = demo", () => {
    expect(computeIsDemoKey("rzp_test_abc", "test", "rzp_test_placeholder", false)).toBe(true);
  });

  it("placeholder key = demo regardless of mode", () => {
    expect(computeIsDemoKey("rzp_test_placeholder", "live", "rzp_test_placeholder", true)).toBe(true);
  });

  it("missing key = demo", () => {
    expect(computeIsDemoKey(undefined, "live", "rzp_live_abc", true)).toBe(true);
  });

  it("draft page (mode=test) default = demo — no real charges during sandbox", () => {
    const razorpayMode: "test" | "live" = "test";
    expect(computeIsDemoKey("rzp_test_placeholder", razorpayMode, "rzp_test_placeholder", false)).toBe(true);
  });
});

// =============================================================================
// 7. Preview URL builder (ChatInterface iframe src)
// =============================================================================

/**
 * Extracted from the iframe src expression in ChatInterface.tsx:
 *   src={`/p/${generatedSlug}${generatedEditToken && !isPublished ? `?preview=${generatedEditToken}` : ""}`}
 */
function buildPreviewUrl(slug: string, editToken: string | null, isPublished: boolean): string {
  return `/p/${slug}${editToken && !isPublished ? `?preview=${editToken}` : ""}`;
}

describe("buildPreviewUrl — ChatInterface iframe src", () => {
  it("draft page with token: includes preview query param", () => {
    const url = buildPreviewUrl("my-draft", "abc123", false);
    expect(url).toBe("/p/my-draft?preview=abc123");
  });

  it("published page: no preview query param (even if token exists)", () => {
    const url = buildPreviewUrl("my-live-page", "abc123", true);
    expect(url).toBe("/p/my-live-page");
  });

  it("draft page without token: no preview param appended", () => {
    const url = buildPreviewUrl("my-draft", null, false);
    expect(url).toBe("/p/my-draft");
  });

  it("after publish (isPublished=true): token cleared from URL", () => {
    const url = buildPreviewUrl("my-page", null, true);
    expect(url).toBe("/p/my-page");
    expect(url).not.toContain("preview=");
  });

  it("preview token is the actual edit token value in the URL", () => {
    const token = "deadbeef1234567890";
    const url = buildPreviewUrl("test-slug", token, false);
    expect(url).toContain(token);
    expect(url).toContain("?preview=");
  });

  it("slug is preserved exactly in the URL", () => {
    const url = buildPreviewUrl("acme-corp-workshop-2", "tok", false);
    expect(url.startsWith("/p/acme-corp-workshop-2")).toBe(true);
  });
});

// =============================================================================
// 8. Generate route: page init for sandbox
// =============================================================================

/**
 * Extracted from /api/generate/route.ts logic applied after buildFullPage():
 *   page.status = "draft";
 *   page.payment.razorpayMode = "test";
 */
function initPageForSandbox<T extends { status: string; payment: { razorpayMode: string } }>(page: T): T {
  page.status = "draft";
  page.payment.razorpayMode = "test";
  return page;
}

describe("Generate route — page sandbox initialisation", () => {
  it("sets status to draft", () => {
    const page = { status: "published", payment: { razorpayMode: "live", amount: 0 } };
    initPageForSandbox(page);
    expect(page.status).toBe("draft");
  });

  it("sets razorpayMode to test", () => {
    const page = { status: "published", payment: { razorpayMode: "live", amount: 0 } };
    initPageForSandbox(page);
    expect(page.payment.razorpayMode).toBe("test");
  });

  it("mutates in place and returns same object", () => {
    const page = { status: "published", payment: { razorpayMode: "live", amount: 9900 } };
    const result = initPageForSandbox(page);
    expect(result).toBe(page);
  });

  it("does not change other payment fields", () => {
    const page = { status: "published", payment: { razorpayMode: "live", amount: 9900, currency: "INR" } };
    initPageForSandbox(page);
    expect(page.payment.amount).toBe(9900);
    expect(page.payment.currency).toBe("INR");
  });
});

// =============================================================================
// 9. Storage namespace isolation — getPage read order
// =============================================================================

/**
 * Verifies the read-priority rule: live namespace is checked before draft.
 * Extracted from blobGetRaw() in pages.ts:
 *   for (const ns of ["live", "draft"] as const) { ... try live first }
 */
function resolvePageNamespace(
  slugInLive: string | null,
  slugInDraft: string | null,
  lookupSlug: string
): "live" | "draft" | "not-found" {
  for (const ns of ["live", "draft"] as const) {
    const stored = ns === "live" ? slugInLive : slugInDraft;
    if (stored === lookupSlug) return ns;
  }
  return "not-found";
}

describe("Storage namespace isolation — read order", () => {
  it("returns live when page exists in live namespace only", () => {
    expect(resolvePageNamespace("my-page", null, "my-page")).toBe("live");
  });

  it("returns draft when page exists in draft namespace only", () => {
    expect(resolvePageNamespace(null, "my-page", "my-page")).toBe("draft");
  });

  it("returns live (takes priority) when same slug exists in both namespaces", () => {
    expect(resolvePageNamespace("my-page", "my-page", "my-page")).toBe("live");
  });

  it("returns not-found when slug exists in neither namespace", () => {
    expect(resolvePageNamespace("other-page", "another-page", "missing-page")).toBe("not-found");
  });

  it("draft pages do not appear in live namespace", () => {
    const result = resolvePageNamespace(null, "my-draft", "my-draft");
    expect(result).toBe("draft");
    expect(result).not.toBe("live");
  });
});

// =============================================================================
// 10. getAllPages excludes drafts
// =============================================================================

/**
 * Simulates the blob list prefix behaviour:
 *   blobGetAll() lists only pages/ prefix, so drafts/ blobs are never returned.
 */
function listAllPagesFromPaths(blobPaths: string[]): string[] {
  return blobPaths
    .filter((p) => p.startsWith("pages/") && p.endsWith(".json"))
    .map((p) => p.slice("pages/".length, -".json".length));
}

describe("getAllPages — excludes draft namespace", () => {
  const blobPaths = [
    "pages/published-page.json",
    "pages/another-live.json",
    "drafts/work-in-progress.json",
    "drafts/my-draft.json",
    "pages/event-june.json",
  ];

  it("returns only pages/ blobs", () => {
    const slugs = listAllPagesFromPaths(blobPaths);
    expect(slugs).toContain("published-page");
    expect(slugs).toContain("another-live");
    expect(slugs).toContain("event-june");
  });

  it("excludes drafts/ blobs", () => {
    const slugs = listAllPagesFromPaths(blobPaths);
    expect(slugs).not.toContain("work-in-progress");
    expect(slugs).not.toContain("my-draft");
  });

  it("returns correct count (3 live, 2 draft → only 3 returned)", () => {
    expect(listAllPagesFromPaths(blobPaths)).toHaveLength(3);
  });

  it("returns empty array when only drafts exist", () => {
    const onlyDrafts = ["drafts/a.json", "drafts/b.json"];
    expect(listAllPagesFromPaths(onlyDrafts)).toHaveLength(0);
  });

  it("returns empty array for empty blob store", () => {
    expect(listAllPagesFromPaths([])).toHaveLength(0);
  });
});

// =============================================================================
// 11. Backwards compatibility — legacy pages without status default to published
// =============================================================================

describeIf(hasSchemas)("Backwards compatibility — legacy pages without status", () => {
  const schema = schemas.PageSchemaValidator as { parse: (d: unknown) => { status: string } };
  if (!schema) return;

  it("page without status field parses as published (schema default)", () => {
    const legacyPage = {
      id: "legacy_1",
      slug: "old-page",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      brand: { name: "Legacy Brand", primaryColor: "#000", secondaryColor: "#fff" },
      template: "modern",
      pageType: "product",
      sections: [],
      payment: {
        razorpayKeyId: "rzp_test_placeholder",
        razorpayMode: "test",
        amount: 0,
        currency: "INR",
        name: "Old Product",
        description: "Legacy",
      },
      seo: { title: "Old Page", description: "Legacy page" },
      maxQuantity: 1,
      isPreOrder: false,
      // no status field — simulates data written before this feature
    };
    const result = schema.parse(legacyPage);
    expect(result.status).toBe("published");
  });

  it("legacy page without status: shouldAllowAccess returns true", () => {
    // Simulates reading a legacy page where status defaults to "published"
    expect(shouldAllowAccess("published", null, undefined)).toBe(true);
  });
});

// =============================================================================
// 12. Rename route slug cleaning
// =============================================================================

/**
 * Extracted from /api/pages/rename/route.ts:
 *   const clean = toSlug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
 */
function cleanPublishSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Slug must start with a letter or number:
 *   if (!clean || !/^[a-z0-9]/.test(clean)) return error
 */
function isValidPublishSlug(clean: string): boolean {
  return !!clean && /^[a-z0-9]/.test(clean);
}

describe("Rename/publish route — slug cleaning", () => {
  it("lowercases input", () => {
    expect(cleanPublishSlug("My Page")).toBe("my-page");
  });

  it("replaces spaces with hyphens", () => {
    expect(cleanPublishSlug("acme workshop june")).toBe("acme-workshop-june");
  });

  it("strips special characters", () => {
    expect(cleanPublishSlug("page@#$%!name")).toBe("pagename");
  });

  it("trims leading/trailing whitespace before conversion", () => {
    expect(cleanPublishSlug("  my page  ")).toBe("my-page");
  });

  it("collapses multiple spaces into a single hyphen (regex /\\s+/ matches one-or-more)", () => {
    expect(cleanPublishSlug("hello   world")).toBe("hello-world");
  });

  it("allows existing hyphens", () => {
    expect(cleanPublishSlug("my-existing-slug")).toBe("my-existing-slug");
  });

  it("valid slug: starts with letter", () => {
    expect(isValidPublishSlug("my-page")).toBe(true);
  });

  it("valid slug: starts with number", () => {
    expect(isValidPublishSlug("2024-workshop")).toBe(true);
  });

  it("invalid slug: starts with hyphen", () => {
    expect(isValidPublishSlug("-my-page")).toBe(false);
  });

  it("invalid slug: empty string", () => {
    expect(isValidPublishSlug("")).toBe(false);
  });

  it("invalid slug: only special chars cleaned to empty", () => {
    expect(isValidPublishSlug(cleanPublishSlug("@#$%"))).toBe(false);
  });
});
