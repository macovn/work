import { NextResponse } from "next/server";
import { prisma, ensureStandardTaskSchema } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureStandardTaskSchema();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get("positionId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: any = {};
    if (!includeInactive) where.isActive = true;
    if (positionId) where.positionId = positionId;

    const groups = await prisma.jobTaskGroup.findMany({
      where,
      include: {
        position: { select: { id: true, name: true, code: true } },
        _count: { select: { standardTasks: true, tasks: true } },
      },
      orderBy: [{ position: { name: "asc" } }, { order: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(groups);
  } catch (error: any) {
    console.error("[JobTaskGroups GET Error]:", error);
    return NextResponse.json({ error: "Lỗi tải Nhóm công việc" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureStandardTaskSchema();
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền quản trị Nhóm công việc" }, { status: 403 });
    }

    const body = await request.json();
    const { positionId, code, name, weight, isActive, order } = body;

    if (!positionId || !code || !name) {
      return NextResponse.json({ error: "Vị trí việc làm, Mã nhóm và Tên nhóm là bắt buộc" }, { status: 400 });
    }

    const cleanCode = String(code).trim().toUpperCase();

    const existing = await prisma.jobTaskGroup.findUnique({
      where: {
        positionId_code: {
          positionId,
          code: cleanCode,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: `Mã nhóm '${cleanCode}' đã tồn tại trong vị trí này` }, { status: 400 });
    }

    const group = await prisma.jobTaskGroup.create({
      data: {
        positionId,
        code: cleanCode,
        name: String(name).trim(),
        weight: typeof weight === "number" ? weight : 100.0,
        isActive: isActive !== false,
        order: typeof order === "number" ? order : 0,
      },
      include: {
        position: true,
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error: any) {
    console.error("[JobTaskGroups POST Error]:", error);
    return NextResponse.json({ error: "Lỗi tạo Nhóm công việc" }, { status: 500 });
  }
}
