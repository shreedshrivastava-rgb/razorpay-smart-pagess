import { NextRequest, NextResponse } from "next/server";

// ElevenLabs STT proxy — keeps API key server-side
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "STT not configured" }, { status: 503 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio") as Blob | null;
  if (!audio) return NextResponse.json({ error: "audio required" }, { status: 400 });

  const upstream = new FormData();
  const ext = (audio as File).name?.includes("mp4") ? "mp4" : "webm";
  upstream.append("file", audio, `recording.${ext}`);
  upstream.append("model_id", "scribe_v1");
  upstream.append("language_code", "en");
  upstream.append("tag_audio_events", "false");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: upstream,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("ElevenLabs STT error:", err);
    return NextResponse.json({ error: "STT failed" }, { status: res.status });
  }

  const data = await res.json() as { text?: string };
  return NextResponse.json({ text: data.text ?? "" });
}
