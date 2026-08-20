import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.json(
      { error: error || "Missing OAuth authorization code" },
      { status: 400 }
    );
  }

  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return NextResponse.json(
      { error: "Google OAuth 2.0 configuration missing." },
      { status: 500 }
    );
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    // Server-side response returning confirmation
    return NextResponse.json({
      success: true,
      message: "Google OAuth 2.0 authorized successfully.",
      hasRefreshToken: !!tokens.refresh_token,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to exchange Google OAuth 2.0 token." },
      { status: 500 }
    );
  }
}
