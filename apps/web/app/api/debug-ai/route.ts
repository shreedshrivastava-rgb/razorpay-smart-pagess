import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.AI_API_KEY ?? "(not set)";
  const base = process.env.AI_BASE_URL ?? "(not set)";
  const model = process.env.AI_MODEL ?? "(not set)";

  const endpoint = base.replace(/\/$/, "").endsWith("/anthropic")
    ? `${base.replace(/\/$/, "")}/v1/messages`
    : `${base.replace(/\/$/, "")}/anthropic/v1/messages`;

  let callResult: unknown;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [{ role: "user", content: "say ok" }],
      }),
      cache: "no-store",
    });
    const body = await res.text();
    callResult = { status: res.status, body: body.slice(0, 300) };
  } catch (e) {
    callResult = { error: String(e) };
  }

  return NextResponse.json({
    endpoint,
    keyPrefix: key.slice(0, 8) + "...",
    model,
    callResult,
  });
}
