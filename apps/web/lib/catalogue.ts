// Catalogue parsing — turn an uploaded file into a list of products.
// CSV / TSV / plain text are parsed deterministically here (no model needed).
// PDFs and images are handed to a vision model only when CATALOGUE_VISION is on.

export interface ParsedProduct {
  name: string;
  price?: number;        // rupees (major units) — the UI multiplies to paise
  description?: string;
}

export interface CatalogueResult {
  products: ParsedProduct[];
  parsed: boolean;       // false → caller should fall back to manual entry
  note?: string;
}

const PRICE_RE = /(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

function toPrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = PRICE_RE.exec(raw.trim());
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Split a single CSV line, honouring double-quoted fields with embedded commas.
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Parse CSV / TSV text into products. Detects a header row (name/price/description)
// when present; otherwise treats "name, price" or "name - price" per line.
export function parseCatalogueText(text: string): ParsedProduct[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const first = splitCsvLine(lines[0], delim).map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => /name|title|product|item/.test(c))
    && first.some((c) => /price|amount|cost|mrp/.test(c) || true);

  let nameIdx = 0, priceIdx = 1, descIdx = 2;
  let rows = lines;
  if (hasHeader && first.length > 1) {
    nameIdx = first.findIndex((c) => /name|title|product|item/.test(c));
    priceIdx = first.findIndex((c) => /price|amount|cost|mrp/.test(c));
    descIdx = first.findIndex((c) => /desc|detail|about/.test(c));
    if (nameIdx < 0) nameIdx = 0;
    rows = lines.slice(1);
  }

  const products: ParsedProduct[] = [];
  for (const line of rows) {
    let cols = splitCsvLine(line, delim);
    // Single-column fallback: "Name - 499" / "Name: 499" / "Name 499".
    if (cols.length === 1) {
      const m = /^(.+?)[\s]*[-:–—]\s*(.+)$/.exec(line);
      cols = m ? [m[1], m[2]] : [line];
    }
    const name = (cols[nameIdx] ?? cols[0] ?? "").trim();
    if (!name || /^(name|title|product|item)$/i.test(name)) continue;
    const price = toPrice(priceIdx >= 0 ? cols[priceIdx] : undefined)
      ?? toPrice(cols.find((c, i) => i !== nameIdx && PRICE_RE.test(c)));
    const description = descIdx >= 0 ? (cols[descIdx] ?? "").trim() || undefined : undefined;
    products.push({ name, price, description });
  }
  return products.slice(0, 100);
}

export function isVisionEnabled(): boolean {
  return process.env.CATALOGUE_VISION === "1" && Boolean(process.env.AI_API_KEY);
}
