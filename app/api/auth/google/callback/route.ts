import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/google-calendar";
import { safeCompare } from "@/lib/crypto-utils";

export const dynamic = "force-dynamic";

function buildStateClearedResponse(body: object, status: number) {
  const response = NextResponse.json(body, { status });
  // Tiêu thụ (xóa) state cookie sau khi dùng để chống replay
  response.cookies.set("oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const savedState = request.cookies.get("oauth_state")?.value;

  // Fail-closed: cả state trên URL và cookie đều bắt buộc phải tồn tại và khớp nhau.
  // Nếu thiếu một trong hai => từ chối (chống CSRF).
  if (!state || !savedState || !safeCompare(state, savedState)) {
    return buildStateClearedResponse(
      { error: "Invalid OAuth state token (Possible CSRF attack)" },
      400
    );
  }

  if (error || !code) {
    return buildStateClearedResponse(
      { error: error || "Missing OAuth authorization code" },
      400
    );
  }

  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    return buildStateClearedResponse(
      { error: "Google OAuth 2.0 configuration missing." },
      500
    );
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    return buildStateClearedResponse(
      {
        success: true,
        message: "Google OAuth 2.0 authorized successfully.",
        hasRefreshToken: !!tokens.refresh_token,
      },
      200
    );
  } catch (err: any) {
    return buildStateClearedResponse(
      { error: err?.message || "Failed to exchange Google OAuth 2.0 token." },
      500
    );
  }
}
