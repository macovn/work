import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureStandardTaskSchema } from "@/lib/prisma";
import { seedStandardTaskCatalog } from "@/prisma/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await ensureStandardTaskSchema();
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền nạp danh mục chuẩn" }, { status: 403 });
    }

    await seedStandardTaskCatalog();

    return NextResponse.json({
      success: true,
      message: "Đã nạp thành công 14 công việc chuẩn cho Pilot Vị trí Dân số",
    });
  } catch (error: any) {
    console.error("[StandardTasks Seed Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi nạp danh mục chuẩn" }, { status: 500 });
  }
}
