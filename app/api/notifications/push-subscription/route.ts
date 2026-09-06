import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

    // Audit M9: không cho phép một user "chiếm" endpoint push của user khác.
    // Trình duyệt dùng chung giữa 2 tài khoản sẽ bị chặn tới khi xử lý (thay vì
    // âm thầm chuyển quyền nhận push).
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
      select: { userId: true },
    });
    if (existing && existing.userId !== user.id) {
      return NextResponse.json(
        { error: "Endpoint push này đã được đăng ký cho tài khoản khác. Vui lòng gỡ đăng ký cũ trước." },
        { status: 409 }
      );
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
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
