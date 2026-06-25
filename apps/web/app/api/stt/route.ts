import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { ownerId } from "@/auth";
import { checkRateLimit, getRateLimitHeaders } from "@/lib/rate-limiter";

// Azure OpenAI Whisper STT proxy — keeps API key server-side
export async function POST(req: NextRequest) {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await checkRateLimit("stt", owner, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: getRateLimitHeaders(rl) }
    );
  }

  const key = process.env.WHISPER_API_KEY;
  const endpoint = process.env.WHISPER_ENDPOINT;
  if (!key || !endpoint) return NextResponse.json({ error: "STT not configured" }, { status: 503 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio") as File | null;
  if (!audio) return NextResponse.json({ error: "audio required" }, { status: 400 });

  const upstream = new FormData();
  upstream.append("file", audio, audio.name ?? "recording.webm");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "api-key": key },  // Azure uses api-key, not Authorization: Bearer
    body: upstream,
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, err }, "Whisper STT error");
    return NextResponse.json({ error: "STT failed" }, { status: res.status });
  }

  const data = await res.json() as { text?: string };
  return NextResponse.json({ text: data.text ?? "" });
}
