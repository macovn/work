import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { NotificationEngine } from "@/lib/notification-engine";

export const dynamic = "force-dynamic";

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

    // Audit L6: validate đầu vào — giờ cảnh báo phải là số nguyên 1..168;
    // cờ bật/tắt phải là boolean thực thụ (tránh Boolean("false") === true).
    const parseHours = (v: unknown): number | null | "invalid" => {
      if (v === undefined) return null;
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 168 ? n : "invalid";
    };
    const parseBool = (v: unknown): boolean | undefined | "invalid" => {
      if (v === undefined) return undefined;
      return typeof v === "boolean" ? v : "invalid";
    };

    const lowH = parseHours(priorityLowHours);
    const medH = parseHours(priorityMediumHours);
    const highH = parseHours(priorityHighHours);
    if (lowH === "invalid" || medH === "invalid" || highH === "invalid") {
      return NextResponse.json({ error: "Giờ cảnh báo phải là số nguyên từ 1 đến 168" }, { status: 400 });
    }

    const emailOn = parseBool(enableEmail);
    const zaloOn = parseBool(enableZalo);
    const pushOn = parseBool(enablePush);
    const gcalOn = parseBool(googleCalendarEnabled);
    if (emailOn === "invalid" || zaloOn === "invalid" || pushOn === "invalid" || gcalOn === "invalid") {
      return NextResponse.json({ error: "Các cờ bật/tắt phải là true hoặc false" }, { status: 400 });
    }

    const parsed: Record<string, number | boolean> = {};
    if (lowH !== null) parsed.priorityLowHours = lowH;
    if (medH !== null) parsed.priorityMediumHours = medH;
    if (highH !== null) parsed.priorityHighHours = highH;
    if (emailOn !== undefined) parsed.enableEmail = emailOn;
    if (zaloOn !== undefined) parsed.enableZalo = zaloOn;
    if (pushOn !== undefined) parsed.enablePush = pushOn;
    if (gcalOn !== undefined) parsed.googleCalendarEnabled = gcalOn;

    if (Object.keys(parsed).length === 0) {
      return NextResponse.json({ error: "Không có dữ liệu cập nhật" }, { status: 400 });
    }

    const updated = await prisma.notificationSetting.upsert({
      where: { id: "default" },
      update: parsed,
      create: {
        id: "default",
        priorityLowHours: (lowH ?? 4) as number,
        priorityMediumHours: (medH ?? 24) as number,
        priorityHighHours: (highH ?? 48) as number,
        enableEmail: emailOn ?? true,
        enableZalo: zaloOn ?? true,
        enablePush: pushOn ?? true,
        googleCalendarEnabled: gcalOn ?? true,
      },
    });

    return NextResponse.json({ message: "Lưu cấu hình thành công", settings: updated });
  } catch (error: any) {
    console.error("[Settings POST API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi cập nhật cấu hình" }, { status: 500 });
  }
}
