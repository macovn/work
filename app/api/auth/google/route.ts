import { NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/google-calendar";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = getGoogleAuthUrl(state);
  if (!authUrl) {
    return NextResponse.json(
      { error: "Google OAuth 2.0 Client ID and Secret are not configured." },
      { status: 500 }
    );
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  return response;
}
