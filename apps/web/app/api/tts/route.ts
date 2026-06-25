import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ElevenLabs TTS proxy — keeps API key server-side, returns audio stream
// Set ELEVENLABS_API_KEY and optionally ELEVENLABS_VOICE_ID in .env.local

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — warm, natural
const MAX_TEXT_LENGTH = 500;

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  let text: string;
  try {
    const body = await req.json() as { text?: string };
    text = (body.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": key,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2", // fastest model, good quality
          voice_settings: { stability: 0.4, similarity_boost: 0.8 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      logger.error({ err }, "ElevenLabs TTS error");
      return NextResponse.json({ error: "TTS failed" }, { status: 500 });
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error({ err }, "TTS proxy error");
    return NextResponse.json({ error: "TTS request failed" }, { status: 500 });
  }
}
