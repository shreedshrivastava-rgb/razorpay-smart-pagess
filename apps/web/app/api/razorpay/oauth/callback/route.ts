import { NextRequest, NextResponse } from "next/server";
import { ownerId } from "@/auth";
import { saveMerchantOAuth } from "@/lib/store/merchants";

const TOKEN_URL = "https://auth.razorpay.com/token";

// Razorpay redirects back here with ?code & ?state after the merchant authorizes.
// Exchange the code for tokens and store them against the signed-in owner.
export async function GET(req: NextRequest) {
  const owner = await ownerId();
  const settingsUrl = new URL("/settings", req.nextUrl.origin);
  if (!owner) return NextResponse.redirect(new URL("/signin", req.nextUrl.origin));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("rzp_oauth_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    settingsUrl.searchParams.set("connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.RAZORPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.RAZORPAY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    settingsUrl.searchParams.set("connect", "error");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: `${req.nextUrl.origin}/api/razorpay/oauth/callback`,
        code,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);

    // Razorpay returns the merchant's access/refresh tokens. The checkout key id
    // for the merchant arrives as public_token / razorpay_key_id depending on the
    // OAuth app config — read whichever is present.
    const t = await tokenRes.json() as {
      access_token: string; refresh_token: string; expires_in: number;
      public_token?: string; razorpay_key_id?: string; razorpay_account_id?: string;
    };
    const keyId = t.razorpay_key_id || t.public_token || "";
    const mode: "test" | "live" = keyId.startsWith("rzp_test_") ? "test" : "live";

    await saveMerchantOAuth(owner, {
      keyId,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expirySeconds: t.expires_in,
      mode,
    });

    settingsUrl.searchParams.set("connect", "ok");
    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete("rzp_oauth_state");
    return res;
  } catch {
    settingsUrl.searchParams.set("connect", "error");
    return NextResponse.redirect(settingsUrl);
  }
}
