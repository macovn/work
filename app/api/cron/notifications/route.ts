import { NextResponse } from "next/server";
import { NotificationEngine } from "@/lib/notification-engine";
import { safeCompare } from "@/lib/crypto-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      // Fail-closed: trên production bắt buộc phải cấu hình CRON_SECRET
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Unauthorized: CRON_SECRET is not configured on the server" },
          { status: 401 }
        );
      }
    } else {
      // Chỉ chấp nhận Authorization: Bearer (Vercel Cron tự động gửi header này).
      // Không chấp nhận secret qua query string để tránh lộ vào access log.
      const authHeader = request.headers.get("authorization");
      const isHeaderValid = !!authHeader && safeCompare(authHeader, `Bearer ${cronSecret}`);

      if (!isHeaderValid) {
        return NextResponse.json({ error: "Unauthorized: Invalid cron secret" }, { status: 401 });
      }
    }

    await NotificationEngine.evaluateAndTriggerNotifications();
    return NextResponse.json({
      success: true,
      message: "Notification Engine evaluated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Cron Notification Error]:", error);
    return NextResponse.json({ error: error?.message || "Cron evaluation error" }, { status: 500 });
  }
}
