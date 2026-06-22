import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface HealthCheck {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  checks: Record<string, { status: string; latency?: number; error?: string }>;
}

async function checkBlobStorage(): Promise<{ status: string; latency?: number; error?: string }> {
  const blobAvailable =
    Boolean(process.env.BLOB_READ_WRITE_TOKEN) ||
    (Boolean(process.env.VERCEL_OIDC_TOKEN) && Boolean(process.env.BLOB_STORE_ID));

  if (!blobAvailable) return { status: "not_configured" };

  const start = Date.now();
  try {
    const { put, get, del } = await import("@vercel/blob");
    const testKey = `health-check-${Date.now()}.json`;
    await put(testKey, JSON.stringify({ ok: true }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    const result = await get(testKey, { access: "private" });
    await del(testKey);
    if (!result) return { status: "degraded", latency: Date.now() - start, error: "write succeeded but read returned null" };
    return { status: "ok", latency: Date.now() - start };
  } catch (err) {
    return { status: "degraded", latency: Date.now() - start, error: String(err) };
  }
}

async function checkAiApi(): Promise<{ status: string; latency?: number; error?: string }> {
  const key = process.env.AI_API_KEY;
  if (!key) return { status: "not_configured" };

  const base = (process.env.AI_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return { status: "not_configured" };

  const start = Date.now();
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 10,
        system: "Respond with ok.",
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { status: "degraded", latency: Date.now() - start, error: `HTTP ${res.status}` };
    return { status: "ok", latency: Date.now() - start };
  } catch (err) {
    return { status: "degraded", latency: Date.now() - start, error: String(err) };
  }
}

async function checkRazorpay(): Promise<{ status: string; latency?: number; error?: string }> {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { status: "not_configured" };

  const start = Date.now();
  try {
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { status: "degraded", latency: Date.now() - start, error: `HTTP ${res.status}` };
    return { status: "ok", latency: Date.now() - start };
  } catch (err) {
    return { status: "degraded", latency: Date.now() - start, error: String(err) };
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();

  const [blob, ai, razorpay] = await Promise.all([
    checkBlobStorage(),
    checkAiApi(),
    checkRazorpay(),
  ]);

  const checks: HealthCheck["checks"] = {
    blob_storage: blob,
    ai_api: ai,
    razorpay: razorpay,
  };

  const allOk = Object.values(checks).every((c) => c.status === "ok" || c.status === "not_configured");
  const anyDown = Object.values(checks).some((c) => c.status === "down");

  const health: HealthCheck = {
    status: anyDown ? "down" : allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };

  const statusCode = health.status === "ok" ? 200 : health.status === "degraded" ? 503 : 500;

  logger.info({ health, durationMs: Date.now() - start }, "Health check");

  return NextResponse.json(health, { status: statusCode });
}
