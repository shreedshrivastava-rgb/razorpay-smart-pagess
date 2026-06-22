// Helpers for the auto-generated product visuals shown when a creator hasn't
// uploaded their own photo. Shared by the single-product hero card and the
// collection grid cards so they stay visually consistent.

// Darken a hex color by a multiplicative factor (0–1). "#6366f1" * 0.22 → deep shade.
export function darken(hex: string, factor: number): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * factor));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * factor));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * factor));
  return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
}

// Pick a representative emoji from a product name, falling back to the page type.
export function inferProductEmoji(productName: string, pageType: string): string {
  const n = (productName ?? "").toLowerCase();
  if (/cake|bake|bak|pastry|cookie|brownie|dessert|tiramisu/.test(n)) return "🎂";
  if (/jam|preserve|chutney|pickle|spread|marmalade/.test(n)) return "🍓";
  if (/coffee|tea|brew|chai/.test(n)) return "☕";
  if (/candle|wax|aroma/.test(n)) return "🕯️";
  if (/jewel|ring|necklace|bracelet|earring/.test(n)) return "💎";
  if (/plant|flower|herb|garden/.test(n)) return "🌿";
  if (/art|paint|sketch|print/.test(n)) return "🎨";
  if (/bag|tote|clutch|purse/.test(n)) return "👜";
  if (/cloth|shirt|dress|fabric|stitch|knit|sew/.test(n)) return "👗";
  if (/soap|skincare|cream|lotion/.test(n)) return "✨";
  if (/book|course|guide|class|lesson/.test(n)) return "📖";
  if (/yoga|fitness|health|wellness/.test(n)) return "🧘";
  if (/juice|drink|beverage|smoothie/.test(n)) return "🥤";
  if (/wine|beer|spirit|whiskey/.test(n)) return "🍷";
  if (/furniture|sofa|chair|table/.test(n)) return "🛋️";
  if (/headphone|earphone|speaker|audio/.test(n)) return "🎧";
  if (/toy|teddy|bear|plush|doll|stuffed/.test(n)) return "🧸";
  if (/bottle|water|flask|sipper/.test(n)) return "🍶";
  if (/shoe|sneaker|footwear|boot/.test(n)) return "👟";
  if (/phone|gadget|electronic|charger|cable/.test(n)) return "📱";
  if (/watch|clock|timepiece/.test(n)) return "⌚";
  if (/perfume|fragrance|scent|cologne/.test(n)) return "🌸";
  const fallbacks: Record<string, string> = {
    product: "🛍️", service: "⚡", course: "📚",
    workshop: "🎓", event: "🎉", consultation: "💡",
    saas: "🚀", subscription: "🌟", collection: "🛍️",
  };
  return fallbacks[pageType] ?? "✦";
}
