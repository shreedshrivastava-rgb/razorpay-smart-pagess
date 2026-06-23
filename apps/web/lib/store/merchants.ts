import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { unstable_noStore as noStore } from "next/cache";
import { logger } from "@/lib/logger";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// A merchant's own Razorpay connection. Stored per page-owner (email), so their
// pages collect payments into their own account. Secrets/tokens are encrypted.
export interface MerchantCredentials {
  ownerId: string;
  method: "keys" | "oauth";
  keyId: string;                 // public — used as the checkout `key`
  keySecretEnc?: string;         // BYO
  oauthAccessTokenEnc?: string;  // OAuth
  oauthRefreshTokenEnc?: string;
  oauthTokenExpiry?: string;     // ISO
  mode: "test" | "live";
  updatedAt: string;
}

// Status returned to the UI — never includes secrets.
export interface MerchantStatus {
  connected: boolean;
  method?: "keys" | "oauth";
  mode?: "test" | "live";
  keyIdMasked?: string;
}

// Server-only auth for calling the Razorpay API on the merchant's behalf.
export interface MerchantAuth {
  keyId: string;
  authHeader: string; // "Basic …" (BYO) or "Bearer …" (OAuth)
  method: "keys" | "oauth";
  keySecret?: string; // present for BYO — used for HMAC signature verification
}

const RZP_TOKEN_URL = "https://auth.razorpay.com/token";

function blobAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

function keyFor(ownerId: string): string {
  return createHash("sha256").update(ownerId.toLowerCase()).digest("hex").slice(0, 32);
}

// ─── Storage (Blob prod / file dev) ─────────────────────────────────────
async function blobSave(c: MerchantCredentials): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(`merchants/${keyFor(c.ownerId)}.json`, JSON.stringify(c), {
    access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
  });
}

async function blobGet(ownerId: string): Promise<MerchantCredentials | null> {
  const { get } = await import("@vercel/blob");
  const res = await get(`merchants/${keyFor(ownerId)}.json`, { access: "private", useCache: false });
  if (!res?.stream) return null;
  return JSON.parse(await new Response(res.stream).text()) as MerchantCredentials;
}

async function blobDel(ownerId: string): Promise<void> {
  const { list, del } = await import("@vercel/blob");
  const p = `merchants/${keyFor(ownerId)}.json`;
  const { blobs } = await list({ prefix: p });
  const b = blobs.find((x) => x.pathname === p);
  if (b) await del(b.url);
}

const DATA_DIR = process.env.VERCEL ? "/tmp/.smart-pages-data" : path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "merchants.json");

async function fileAll(): Promise<Record<string, MerchantCredentials>> {
  try { return JSON.parse(await readFile(FILE, "utf-8")) as Record<string, MerchantCredentials>; }
  catch { return {}; }
}
async function fileWrite(all: Record<string, MerchantCredentials>): Promise<void> {
  try { await mkdir(DATA_DIR, { recursive: true }); await writeFile(FILE, JSON.stringify(all, null, 2), "utf-8"); }
  catch { /* non-fatal */ }
}

async function load(ownerId: string): Promise<MerchantCredentials | null> {
  noStore();
  if (blobAvailable()) return blobGet(ownerId);
  return (await fileAll())[keyFor(ownerId)] ?? null;
}
async function persist(c: MerchantCredentials): Promise<void> {
  if (blobAvailable()) { await blobSave(c); return; }
  const all = await fileAll();
  all[keyFor(c.ownerId)] = c;
  await fileWrite(all);
}

// ─── Public API ─────────────────────────────────────────────────────────
export async function saveMerchantKeys(
  ownerId: string,
  { keyId, keySecret, mode }: { keyId: string; keySecret: string; mode: "test" | "live" }
): Promise<void> {
  logger.info({ owner: ownerId, mode }, "saveMerchantKeys");
  await persist({
    ownerId, method: "keys", keyId,
    keySecretEnc: encryptSecret(keySecret), mode,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveMerchantOAuth(
  ownerId: string,
  { keyId, accessToken, refreshToken, expirySeconds, mode }:
  { keyId: string; accessToken: string; refreshToken: string; expirySeconds: number; mode: "test" | "live" }
): Promise<void> {
  logger.info({ owner: ownerId, mode }, "saveMerchantOAuth");
  await persist({
    ownerId, method: "oauth", keyId,
    oauthAccessTokenEnc: encryptSecret(accessToken),
    oauthRefreshTokenEnc: encryptSecret(refreshToken),
    oauthTokenExpiry: new Date(Date.now() + expirySeconds * 1000).toISOString(),
    mode, updatedAt: new Date().toISOString(),
  });
}

export async function deleteMerchant(ownerId: string): Promise<void> {
  logger.info({ owner: ownerId }, "deleteMerchant");
  if (blobAvailable()) { await blobDel(ownerId); return; }
  const all = await fileAll();
  delete all[keyFor(ownerId)];
  await fileWrite(all);
}

export async function getMerchantStatus(ownerId: string): Promise<MerchantStatus> {
  const c = await load(ownerId);
  if (!c) return { connected: false };
  const tail = c.keyId.slice(-4);
  return { connected: true, method: c.method, mode: c.mode, keyIdMasked: `••••${tail}` };
}

// The public key id only (for the checkout widget). null if not connected.
export async function getMerchantKeyId(ownerId: string): Promise<string | null> {
  const c = await load(ownerId);
  return c?.keyId ?? null;
}

// Server-only: how to authenticate Razorpay API calls for this merchant.
// Refreshes the OAuth access token if expired. null if not connected.
export async function resolveMerchantAuth(ownerId: string): Promise<MerchantAuth | null> {
  const c = await load(ownerId);
  if (!c) return null;

  if (c.method === "keys" && c.keySecretEnc) {
    const secret = decryptSecret(c.keySecretEnc);
    return {
      keyId: c.keyId, method: "keys", keySecret: secret,
      authHeader: `Basic ${Buffer.from(`${c.keyId}:${secret}`).toString("base64")}`,
    };
  }

  if (c.method === "oauth" && c.oauthAccessTokenEnc) {
    let accessToken = decryptSecret(c.oauthAccessTokenEnc);
    const expired = c.oauthTokenExpiry ? new Date(c.oauthTokenExpiry).getTime() < Date.now() + 60_000 : false;
    if (expired && c.oauthRefreshTokenEnc) {
      const refreshed = await refreshOAuth(c, decryptSecret(c.oauthRefreshTokenEnc));
      if (refreshed) accessToken = refreshed;
    }
    return { keyId: c.keyId, method: "oauth", authHeader: `Bearer ${accessToken}` };
  }

  return null;
}

async function refreshOAuth(c: MerchantCredentials, refreshToken: string): Promise<string | null> {
  const clientId = process.env.RAZORPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.RAZORPAY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch(RZP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId, client_secret: clientSecret,
        grant_type: "refresh_token", refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    await persist({
      ...c,
      oauthAccessTokenEnc: encryptSecret(t.access_token),
      oauthRefreshTokenEnc: t.refresh_token ? encryptSecret(t.refresh_token) : c.oauthRefreshTokenEnc,
      oauthTokenExpiry: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return t.access_token;
  } catch {
    return null;
  }
}
