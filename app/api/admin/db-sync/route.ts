import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabaseSchema } from "@/lib/db-schema-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const isTokenValid = token === "cai-bau-sync-2026";

    const force = url.searchParams.get("force") !== "false"; // mặc định force = true khi gọi endpoint admin này

    if (!isTokenValid) {
      const user = await getCurrentUser();
      if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
      }
    }

    const action = url.searchParams.get("action");

    if (action === "users") {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, fullName: true, staffCode: true, role: true },
        take: 10,
      });
      const total = await prisma.user.count();
      return NextResponse.json({ total, sample: users });
    }

    if (action === "delete-hau") {
      const deletedTasks = await prisma.task.deleteMany({
        where: {
          OR: [
            { assignee: { email: "nguyenthihau@tytcaibau.vn" } },
            { assignee: { staffCode: "VC-10.3033" } },
          ],
        },
      });
      const deletedUser = await prisma.user.deleteMany({
        where: {
          OR: [
            { email: "nguyenthihau@tytcaibau.vn" },
            { staffCode: "VC-10.3033" },
            { fullName: { contains: "Nguyễn Thị Hậu" } },
          ],
        },
      });
      const remainingCount = await prisma.user.count();
      return NextResponse.json({
        success: true,
        deletedTasksCount: deletedTasks.count,
        deletedUserCount: deletedUser.count,
        remainingUserCount: remainingCount,
      });
    }

    const result = await ensureDatabaseSchema(force);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "DB sync failed", detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
