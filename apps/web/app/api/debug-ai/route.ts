import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  const isVercel = process.env.VERCEL;
  const slug = req.nextUrl.searchParams.get("slug");

  const blobAvailable = Boolean(blobToken || (oidcToken && storeId));

  let writeResult: unknown = "skipped";
  let readResult: unknown = "skipped";
  let slugRead: unknown = "skipped";

  if (blobAvailable) {
    try {
      const { put, get } = await import("@vercel/blob");
      const ts = Date.now();
      const blob = await put("debug/test.json", JSON.stringify({ ok: true, ts }), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      writeResult = { pathname: blob.pathname };

      const result = await get("debug/test.json", { access: "private" });
      if (result) {
        const text = await Promise.race([new Response(result.stream).text(), new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 10_000))]);
        const data = JSON.parse(text) as { ts: number };
        readResult = { ok: true, tsMatch: data.ts === ts };
      } else {
        readResult = { ok: false, reason: "get returned null" };
      }
    } catch (e) {
      writeResult = { error: String(e) };
    }

    if (slug) {
      try {
        const { get, list } = await import("@vercel/blob");
        const pathname = `pages/${slug}.json`;

        const getResult = await get(pathname, { access: "private" });
        if (getResult) {
          const text = await Promise.race([new Response(getResult.stream).text(), new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 10_000))]);
          slugRead = { method: "get", ok: true, dataLength: text.length, preview: text.slice(0, 100) };
        } else {
          const { blobs } = await list({ prefix: `pages/${slug}` });
          slugRead = { method: "list", ok: false, getReturnedNull: true, blobsFound: blobs.map((b) => b.pathname) };
        }
      } catch (e) {
        slugRead = { error: String(e) };
      }
    }
  }

  return NextResponse.json({
    isVercel: Boolean(isVercel),
    blobAvailable,
    hasBlobToken: Boolean(blobToken),
    hasOidcToken: Boolean(oidcToken),
    hasStoreId: Boolean(storeId),
    storeId: storeId ?? null,
    writeResult,
    readResult,
    slugRead,
  });
}
