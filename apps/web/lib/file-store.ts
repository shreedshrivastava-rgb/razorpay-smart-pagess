import { logger } from "@/lib/logger";

// Stores arbitrary uploaded files (PDF/CSV/doc/txt) and returns a URL.
// Mirrors lib/image-store but keeps the real extension/content-type instead of
// forcing .jpg, so catalogue files and attachments download/open correctly.

function blobAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/plain": "txt",
  "text/tab-separated-values": "tsv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// Allowed non-image upload types (mirrored on the client `accept` attribute).
export const ALLOWED_DOC_TYPES = Object.keys(EXT);

export function extForType(contentType: string): string {
  return EXT[contentType] ?? "bin";
}

export async function persistFileBytes(bytes: Buffer, key: string, contentType: string): Promise<string | null> {
  if (bytes.byteLength < 8) return null;
  const ext = extForType(contentType);
  try {
    if (blobAvailable()) {
      const { put } = await import("@vercel/blob");
      const { url } = await put(`uploads/${key}.${ext}`, bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType,
      });
      return url;
    }
    const { writeFile, mkdir } = await import("fs/promises");
    const path = await import("path");
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const file = `${key.replace(/[^a-z0-9-]/gi, "_")}-${bytes.byteLength}.${ext}`;
    await writeFile(path.join(dir, file), bytes);
    return `/uploads/${file}`;
  } catch (err) {
    logger.warn({ key, err: err instanceof Error ? err.message : String(err) }, "persistFileBytes failed");
    return null;
  }
}

// Decode any base64 data URL into bytes + content type (not image-restricted).
export function decodeAnyDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } | null {
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    return { contentType: m[1].toLowerCase(), bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}
