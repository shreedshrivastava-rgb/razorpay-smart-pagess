/**
 * One-shot migration: re-encrypt all stored merchant credentials from an OLD
 * CREDENTIALS_ENC_KEY to a NEW one, so the encryption key can be rotated
 * without locking merchants out of their own Razorpay accounts.
 *
 * MUST be run ONCE before swapping CREDENTIALS_ENC_KEY in production.
 *
 * Usage:
 *   OLD_CREDENTIALS_ENC_KEY=<old 64-hex>  CREDENTIALS_ENC_KEY=<new 64-hex> \
 *     npx tsx scripts/reencrypt-credentials.ts [--dry-run]
 *
 * Safe to re-run: a record whose fields already decrypt with the NEW key is
 * left untouched (idempotent). Logs counts only — never secret values.
 *
 * Storage backends mirror lib/store/merchants.ts:
 *   - Vercel Blob   (when BLOB_READ_WRITE_TOKEN is set): merchants/<hash>.json
 *   - Local file    (otherwise): .data/merchants.json
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { readFile, writeFile } from "fs/promises";
import path from "path";

// ─── Self-contained AES-256-GCM (matches lib/crypto.ts format) ──────────────
// Format: base64(iv).base64(authTag).base64(ciphertext)
function keyBuf(name: string, hex: string | undefined): Buffer {
  if (!hex || hex.length !== 64) {
    throw new Error(`${name} must be a 64-char hex string (32 bytes). Got length ${hex?.length ?? 0}.`);
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

function decrypt(blob: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

const ENC_FIELDS = ["keySecretEnc", "oauthAccessTokenEnc", "oauthRefreshTokenEnc"] as const;
type MerchantRecord = Record<string, unknown> & Partial<Record<(typeof ENC_FIELDS)[number], string>>;

/**
 * Re-encrypt the encrypted fields of one record.
 * Returns { record, changed, alreadyMigrated } so the caller can decide to persist.
 * Idempotent: if a field decrypts with NEW (not OLD), it's left as-is.
 */
function rotateRecord(
  rec: MerchantRecord,
  oldKey: Buffer,
  newKey: Buffer
): { record: MerchantRecord; changed: boolean; skippedAlreadyNew: number } {
  const out: MerchantRecord = { ...rec };
  let changed = false;
  let skippedAlreadyNew = 0;

  for (const field of ENC_FIELDS) {
    const val = rec[field];
    if (!val) continue;
    // Already on the new key? leave it (idempotent re-run).
    try {
      decrypt(val, newKey);
      skippedAlreadyNew++;
      continue;
    } catch {
      /* not new-key — try old */
    }
    // Must decrypt with the old key; if this throws we abort the whole record.
    const plain = decrypt(val, oldKey);
    out[field] = encrypt(plain, newKey);
    changed = true;
  }

  return { record: out, changed, skippedAlreadyNew };
}

function blobAvailable(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)
  );
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const oldKey = keyBuf("OLD_CREDENTIALS_ENC_KEY", process.env.OLD_CREDENTIALS_ENC_KEY);
  const newKey = keyBuf("CREDENTIALS_ENC_KEY", process.env.CREDENTIALS_ENC_KEY);

  if (Buffer.compare(oldKey, newKey) === 0) {
    console.error("OLD and NEW keys are identical — nothing to do.");
    process.exit(1);
  }

  console.log(`Mode: ${dryRun ? "DRY-RUN (no writes)" : "LIVE"}`);
  console.log(`Backend: ${blobAvailable() ? "Vercel Blob" : "local file (.data/merchants.json)"}`);

  let total = 0;
  let changedCount = 0;
  let alreadyNewFields = 0;
  const failures: string[] = [];

  if (blobAvailable()) {
    const { list, put, get } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "merchants/" });
    for (const b of blobs) {
      total++;
      try {
        const res = await get(b.pathname, { access: "private", useCache: false });
        if (!res?.stream) { failures.push(`${b.pathname} (no stream)`); continue; }
        const rec = JSON.parse(await new Response(res.stream).text()) as MerchantRecord;
        const { record, changed, skippedAlreadyNew } = rotateRecord(rec, oldKey, newKey);
        alreadyNewFields += skippedAlreadyNew;
        if (changed) {
          changedCount++;
          if (!dryRun) {
            await put(b.pathname, JSON.stringify(record), {
              access: "private", addRandomSuffix: false, allowOverwrite: true,
              contentType: "application/json",
            });
          }
        }
      } catch (err) {
        failures.push(`${b.pathname}: ${(err as Error).message}`);
      }
    }
  } else {
    const DATA_DIR = process.env.VERCEL ? "/tmp/.smart-pages-data" : path.join(process.cwd(), ".data");
    const FILE = path.join(DATA_DIR, "merchants.json");
    let all: Record<string, MerchantRecord>;
    try {
      all = JSON.parse(await readFile(FILE, "utf-8")) as Record<string, MerchantRecord>;
    } catch {
      console.log("No merchants.json found — nothing to migrate.");
      return;
    }
    for (const [hash, rec] of Object.entries(all)) {
      total++;
      try {
        const { record, changed, skippedAlreadyNew } = rotateRecord(rec, oldKey, newKey);
        alreadyNewFields += skippedAlreadyNew;
        if (changed) { changedCount++; all[hash] = record; }
      } catch (err) {
        failures.push(`${hash}: ${(err as Error).message}`);
      }
    }
    if (!dryRun && changedCount > 0) {
      await writeFile(FILE, JSON.stringify(all, null, 2), "utf-8");
    }
  }

  console.log("\n─── Summary ───");
  console.log(`Merchants scanned:        ${total}`);
  console.log(`Records re-encrypted:     ${changedCount}${dryRun ? " (would be)" : ""}`);
  console.log(`Fields already on new key: ${alreadyNewFields} (skipped)`);
  if (failures.length) {
    console.error(`\nFAILURES (${failures.length}) — these did NOT decrypt with OLD key; do NOT rotate yet:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(dryRun
    ? "\nDry-run OK. Re-run without --dry-run to write, then swap CREDENTIALS_ENC_KEY."
    : "\nDone. You may now set CREDENTIALS_ENC_KEY to the new value everywhere.");
}

run().catch((err) => { console.error("Migration aborted:", err); process.exit(1); });
