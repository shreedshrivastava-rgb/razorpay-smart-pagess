import { pickWritablePageUpdate, WRITABLE_PAGE_FIELDS, IMMUTABLE_PAGE_FIELDS } from "@/lib/page-update";

describe("pickWritablePageUpdate (mass-assignment guard)", () => {
  it("drops internal _-prefixed fields (the actual vulnerability)", () => {
    const out = pickWritablePageUpdate({
      brand: { name: "Acme" },
      _ownerId: "attacker@evil.com",
      _editToken: "stolen",
      _chat: { messages: [] },
    });
    expect(out).toHaveProperty("brand");
    expect(out).not.toHaveProperty("_ownerId");
    expect(out).not.toHaveProperty("_editToken");
    expect(out).not.toHaveProperty("_chat");
  });

  it("drops immutable identity/system fields", () => {
    const out = pickWritablePageUpdate({
      id: "spoofed",
      slug: "other-page",
      createdAt: "2000-01-01",
      updatedAt: "2000-01-01",
      payment: { amount: 100, name: "X", description: "Y" },
    });
    for (const f of IMMUTABLE_PAGE_FIELDS) expect(out).not.toHaveProperty(f);
    expect(out).toHaveProperty("payment");
  });

  it("keeps all legitimate content fields the editor sends", () => {
    // The editor PATCHes a full PageSchema; every writable field must survive.
    const fullLikePage: Record<string, unknown> = {};
    for (const f of WRITABLE_PAGE_FIELDS) fullLikePage[f] = "x";
    const out = pickWritablePageUpdate(fullLikePage);
    for (const f of WRITABLE_PAGE_FIELDS) expect(out).toHaveProperty(f);
  });

  it("ignores unknown fields not in the schema", () => {
    const out = pickWritablePageUpdate({ status: "draft", bogusField: "nope" });
    expect(out).toHaveProperty("status"); // status is a real, writable field
    expect(out).not.toHaveProperty("bogusField");
  });

  it("returns {} for non-object input", () => {
    expect(pickWritablePageUpdate(null)).toEqual({});
    expect(pickWritablePageUpdate("string")).toEqual({});
    expect(pickWritablePageUpdate(42)).toEqual({});
  });

  it("status is writable but id/slug are not (sanity on the boundary)", () => {
    expect(WRITABLE_PAGE_FIELDS.has("status")).toBe(true);
    expect(WRITABLE_PAGE_FIELDS.has("id")).toBe(false);
    expect(WRITABLE_PAGE_FIELDS.has("slug")).toBe(false);
  });
});
