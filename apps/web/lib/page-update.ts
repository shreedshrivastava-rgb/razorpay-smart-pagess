import { PageSchemaValidator, type PageSchema } from "@/lib/schema/page-schema";

// Fields a PATCH /api/pages/[id] may write. Derived from the page schema so it
// can't drift, minus identity/system fields the client must never change (the
// storage key/slug, id, creation time, and server-managed updatedAt).
// Internal "_"-prefixed fields (_ownerId, _editToken, _chat) are not part of
// the schema, so they're excluded here — preventing record hijack / token
// rotation via mass assignment.
export const IMMUTABLE_PAGE_FIELDS = new Set(["id", "slug", "createdAt", "updatedAt"]);

export const WRITABLE_PAGE_FIELDS = new Set(
  Object.keys(PageSchemaValidator.shape).filter((k) => !IMMUTABLE_PAGE_FIELDS.has(k))
);

/** Keep only known, writable page fields from an untrusted PATCH body. */
export function pickWritablePageUpdate(raw: unknown): Partial<PageSchema> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.startsWith("_")) continue;
    if (WRITABLE_PAGE_FIELDS.has(k)) out[k] = v;
  }
  return out as Partial<PageSchema>;
}
