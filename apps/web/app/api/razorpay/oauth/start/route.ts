import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ownerId } from "@/auth";

const AUTHORIZE_URL = "https://auth.razorpay.com/authorize";

// Kicks off the Razorpay Partner OAuth flow. Requires the platform's OAuth app
// credentials (RAZORPAY_OAUTH_CLIENT_ID). Until those are set, this 503s and the
// Settings UI keeps the "Connect with Razorpay" button disabled.
export async function GET(req: NextRequest) {
  const owner = await ownerId();
  if (!owner) return NextResponse.redirect(new URL("/signin", req.nextUrl.origin));

  const clientId = process.env.RAZORPAY_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Razorpay OAuth is not configured on this server." }, { status: 503 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/razorpay/oauth/callback`;
  const state = randomBytes(16).toString("hex");

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  // Bind the state to this browser to defend the callback against CSRF.
  res.cookies.set("rzp_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
