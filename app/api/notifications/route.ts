import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [inAppAlerts, logs] = await Promise.all([
      prisma.inAppNotification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      user.role === "ADMIN"
        ? prisma.notificationLog.findMany({
            include: {
              user: { select: { fullName: true, email: true } },
              task: { select: { code: true, title: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [],
    ]);

    const unreadCount = inAppAlerts.filter((a) => !a.isRead).length;

    return NextResponse.json({
      inAppAlerts,
      unreadCount,
      logs: user.role === "ADMIN" ? logs : [],
    });
  } catch (error: any) {
    console.error("[Notifications GET API Error]:", error);
    return NextResponse.json({ error: "Lỗi lấy thông báo" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      await prisma.inAppNotification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ message: "Đã đánh dấu tất cả là đã đọc" });
    }

    if (notificationId) {
      await prisma.inAppNotification.update({
        where: { id: notificationId },
        data: { isRead: true },
      });
      return NextResponse.json({ message: "Đã đánh dấu đã đọc" });
    }

    return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });
  } catch (error: any) {
    console.error("[Notifications PATCH API Error]:", error);
    return NextResponse.json({ error: "Lỗi cập nhật thông báo" }, { status: 500 });
  }
}
