import { NextRequest, NextResponse } from "next/server";
import { ownerId } from "@/auth";
import { getMerchantStatus, deleteMerchant } from "@/lib/store/merchants";

function checkCsrf(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;
  try { return new URL(source).host === host; } catch { return false; }
}

export async function GET() {
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    success: true,
    status: await getMerchantStatus(owner),
    oauthAvailable: Boolean(process.env.RAZORPAY_OAUTH_CLIENT_ID),
  });
}

export async function DELETE(req: NextRequest) {
  if (!checkCsrf(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const owner = await ownerId();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteMerchant(owner);
  return NextResponse.json({ success: true });
}
