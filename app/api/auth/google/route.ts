import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const authUrl = getGoogleAuthUrl();
  if (!authUrl) {
    return NextResponse.json(
      { error: "Google OAuth 2.0 Client ID and Secret are not configured." },
      { status: 500 }
    );
  }
  return NextResponse.redirect(authUrl);
}
