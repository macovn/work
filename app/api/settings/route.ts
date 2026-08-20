import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { NotificationEngine } from "@/lib/notification-engine";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const settings = await NotificationEngine.getSettings();
    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error("[Settings GET API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi lấy cấu hình hệ thống" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const {
      priorityLowHours,
      priorityMediumHours,
      priorityHighHours,
      enableEmail,
      enableZalo,
      enablePush,
      googleCalendarEnabled,
    } = body;

    const updated = await prisma.notificationSetting.upsert({
      where: { id: "default" },
      update: {
        ...(priorityLowHours !== undefined && { priorityLowHours: parseInt(priorityLowHours, 10) }),
        ...(priorityMediumHours !== undefined && { priorityMediumHours: parseInt(priorityMediumHours, 10) }),
        ...(priorityHighHours !== undefined && { priorityHighHours: parseInt(priorityHighHours, 10) }),
        ...(enableEmail !== undefined && { enableEmail: Boolean(enableEmail) }),
        ...(enableZalo !== undefined && { enableZalo: Boolean(enableZalo) }),
        ...(enablePush !== undefined && { enablePush: Boolean(enablePush) }),
        ...(googleCalendarEnabled !== undefined && { googleCalendarEnabled: Boolean(googleCalendarEnabled) }),
      },
      create: {
        id: "default",
        priorityLowHours: parseInt(priorityLowHours || "4", 10),
        priorityMediumHours: parseInt(priorityMediumHours || "24", 10),
        priorityHighHours: parseInt(priorityHighHours || "48", 10),
        enableEmail: Boolean(enableEmail),
        enableZalo: Boolean(enableZalo),
        enablePush: Boolean(enablePush),
        googleCalendarEnabled: Boolean(googleCalendarEnabled),
      },
    });

    return NextResponse.json({ message: "Lưu cấu hình thành công", settings: updated });
  } catch (error: any) {
    console.error("[Settings POST API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi cập nhật cấu hình" }, { status: 500 });
  }
}
