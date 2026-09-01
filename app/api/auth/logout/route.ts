import { NextResponse } from "next/server";
import { removeAuthCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await removeAuthCookie();
  const response = NextResponse.json({ message: "Đã đăng xuất" });
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
