import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Paths reachable without signing in. Everything else requires auth.
// - /signin            : the sign-in screen itself
// - /p/*               : published payment pages (buyers are not signed in)
// - /api/auth/*        : Auth.js endpoints
// - /api/razorpay/*    : checkout order/verify, called by buyers
// - /api/seed          : demo-page seeding (server-to-server, no session)
const PUBLIC_PREFIXES = ["/signin", "/p/", "/api/auth", "/api/razorpay", "/api/seed"];

export default auth((req) => {
  const { pathname, search, origin } = req.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  if (isPublic || req.auth) return NextResponse.next();

  // Unauthenticated API calls get a clean 401 instead of an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/signin", origin);
  signInUrl.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)"],
};
