import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys) {
      return NextResponse.json({ error: "Dữ liệu đăng ký push không hợp lệ" }, { status: 400 });
    }

    const keysJson = typeof keys === "string" ? keys : JSON.stringify(keys);

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: user.id,
        keys: keysJson,
      },
      create: {
        userId: user.id,
        endpoint,
        keys: keysJson,
      },
    });

    return NextResponse.json({ message: "Đã đăng ký Web Push thành công" });
  } catch (error: any) {
    console.error("[Push Subscription API Error]:", error);
    return NextResponse.json({ error: "Lỗi lưu Web Push subscription" }, { status: 500 });
  }
}
