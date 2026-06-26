import { logger } from "@/lib/logger";

// Persists raw image bytes to a fast origin and returns a URL.
// Production: Vercel Blob (CDN). Local dev: public/generated (served statically).
// Shared by the AI image-bake flow and the edit-mode upload endpoint so we never
// store multi-MB base64 data URLs inside the page JSON.

function blobAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

export async function persistImageBytes(bytes: Buffer, key: string, contentType = "image/jpeg"): Promise<string | null> {
  if (bytes.byteLength < 100) return null;
  try {
    if (blobAvailable()) {
      const { put } = await import("@vercel/blob");
      const { url } = await put(`generated/${key}.jpg`, bytes, {
        access: "public",
        addRandomSuffix: true,
        contentType,
      });
      return url;
    }
    // Local dev — write under public/ so Next serves it instantly.
    const { writeFile, mkdir } = await import("fs/promises");
    const path = await import("path");
    const dir = path.join(process.cwd(), "public", "generated");
    await mkdir(dir, { recursive: true });
    const file = `${key.replace(/[^a-z0-9-]/gi, "_")}-${bytes.byteLength}.jpg`;
    await writeFile(path.join(dir, file), bytes);
    return `/generated/${file}`;
  } catch (err) {
    logger.warn({ key, err: err instanceof Error ? err.message : String(err) }, "persistImageBytes failed");
    return null;
  }
}

// Convenience: download a remote image (e.g. a Pollinations URL) and persist it.
export async function persistImageFromUrl(sourceUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return persistImageBytes(Buffer.from(await res.arrayBuffer()), key);
  } catch {
    return null;
  }
}

// Client helper: POST a base64 data URL to /api/upload and get back a stored URL.
// Returns null on failure (callers keep the optimistic data-URL preview).
export async function uploadImage(dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  } catch {
    return null;
  }
}

// Decode a base64 data URL ("data:image/png;base64,…") into bytes + content type.
export function decodeDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    return { contentType: m[1], bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}
