import { NextResponse } from "next/server";
import { runSeed } from "@/prisma/seed";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ quản trị viên mới có quyền tạo dữ liệu mẫu" }, { status: 403 });
    }

    await runSeed();
    return NextResponse.json({
      message: "Khởi tạo dữ liệu mẫu thành công!",
      accounts: [
        { role: "ADMIN", email: "admin@example.com", password: "admin123" },
        { role: "USER", email: "user1@example.com", password: "user123" },
        { role: "USER", email: "user2@example.com", password: "user123" },
        { role: "USER", email: "user3@example.com", password: "user123" },
      ],
    });
  } catch (error: any) {
    console.error("[Seed API Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi khởi tạo dữ liệu mẫu" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ quản trị viên mới có quyền xóa dữ liệu" }, { status: 403 });
    }

    const { prisma } = await import("@/lib/prisma");
    const result = await prisma.task.deleteMany({});
    return NextResponse.json({
      message: `Đã xóa thành công ${result.count} công việc!`,
      deletedCount: result.count,
    });
  } catch (error: any) {
    console.error("[Seed DELETE API Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi khi xóa dữ liệu mẫu" }, { status: 500 });
  }
}
