import type { ProductGridItem } from "@/lib/schema/page-schema";

// Client helper for structural edits the field-based inline editor can't express
// (adding / deleting array items). Fetches the page, mutates the matching
// product-grid section's items, and PATCHes — so add/delete persist immediately,
// independent of the AI regeneration path.
export async function mutateProductGridItems(
  sectionId: string,
  update: (items: ProductGridItem[]) => ProductGridItem[]
): Promise<boolean> {
  const slug = window.location.pathname.match(/\/p\/([^/?]+)/)?.[1];
  if (!slug) return false;
  try {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return false;
    const { data: page } = (await res.json()) as { data?: { sections?: Array<{ id: string; type: string; items?: ProductGridItem[] }> } };
    if (!page?.sections) return false;
    const sections = page.sections.map((s) =>
      s.id === sectionId && s.type === "product-grid" ? { ...s, items: update(s.items ?? []) } : s
    );
    let token = "";
    try { token = localStorage.getItem(`edit_token_${slug}`) ?? ""; } catch { /* ignore */ }
    const patch = await fetch(`/api/pages/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Edit-Token": token },
      body: JSON.stringify({ sections }),
    });
    return patch.ok;
  } catch {
    return false;
  }
}

export function newProductId(): string {
  return `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
