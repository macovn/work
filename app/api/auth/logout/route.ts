import { NextResponse } from "next/server";
import { removeAuthCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await removeAuthCookie();
  return NextResponse.json({ message: "Đã đăng xuất" });
}
