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
    const includeInactive = searchParams.get("includeInactive") === "true";

    const positions = await prisma.jobPosition.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        groups: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { order: "asc" },
        },
        _count: {
          select: { standardTasks: true, tasks: true },
        },
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(positions);
  } catch (error: any) {
    console.error("[JobPositions GET Error]:", error);
    return NextResponse.json({ error: "Lỗi tải danh mục Vị trí việc làm" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureStandardTaskSchema();
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền quản trị Vị trí việc làm" }, { status: 403 });
    }

    const body = await request.json();
    const { code, name, description, isActive, order } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Mã và Tên vị trí việc làm là bắt buộc" }, { status: 400 });
    }

    const cleanCode = String(code).trim().toUpperCase();

    const existing = await prisma.jobPosition.findUnique({
      where: { code: cleanCode },
    });

    if (existing) {
      return NextResponse.json({ error: `Mã vị trí '${cleanCode}' đã tồn tại` }, { status: 400 });
    }

    const position = await prisma.jobPosition.create({
      data: {
        code: cleanCode,
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        isActive: isActive !== false,
        order: typeof order === "number" ? order : 0,
      },
    });

    return NextResponse.json(position, { status: 201 });
  } catch (error: any) {
    console.error("[JobPositions POST Error]:", error);
    return NextResponse.json({ error: "Lỗi tạo Vị trí việc làm" }, { status: 500 });
  }
}
