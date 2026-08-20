import { NextResponse } from "next/server";
import { NotificationEngine } from "@/lib/notification-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
