import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
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
        standardTasks: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { order: "asc" },
        },
        _count: {
          select: { standardTasks: true, tasks: true, users: true },
        },
      },
      orderBy: [{ order: "asc" }, { code: "asc" }],
    });

    return NextResponse.json(positions);
  } catch (error: any) {
    console.error("[JobPositions GET Error]:", error);
    return NextResponse.json({ error: "Lỗi tải danh mục Vị trí việc làm" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền quản trị Vị trí việc làm" }, { status: 403 });
    }

    const body = await request.json();
    const {
      code,
      name,
      description,
      careerRank,
      targetRatio,
      approvedQuota,
      currentHeadcount,
      standardHoursYear,
      method,
      isActive,
      order,
    } = body;

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
        careerRank: careerRank ? String(careerRank).trim() : null,
        targetRatio: typeof targetRatio === "number" ? targetRatio : null,
        approvedQuota: typeof approvedQuota === "number" ? approvedQuota : null,
        currentHeadcount: typeof currentHeadcount === "number" ? currentHeadcount : null,
        standardHoursYear: typeof standardHoursYear === "number" ? standardHoursYear : 1904,
        method: method ? String(method).trim() : "PP1+PP2",
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

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền cập nhật Vị trí việc làm" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      name,
      description,
      careerRank,
      targetRatio,
      approvedQuota,
      currentHeadcount,
      standardHoursYear,
      method,
      isActive,
      order,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID vị trí việc làm là bắt buộc" }, { status: 400 });
    }

    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (careerRank !== undefined) data.careerRank = careerRank ? String(careerRank).trim() : null;
    if (targetRatio !== undefined) data.targetRatio = targetRatio !== null ? Number(targetRatio) : null;
    if (approvedQuota !== undefined) data.approvedQuota = approvedQuota !== null ? Number(approvedQuota) : null;
    if (currentHeadcount !== undefined) data.currentHeadcount = currentHeadcount !== null ? Number(currentHeadcount) : null;
    if (standardHoursYear !== undefined) data.standardHoursYear = Number(standardHoursYear) || 1904;
    if (method !== undefined) data.method = method ? String(method).trim() : "PP1+PP2";
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (typeof order === "number" && !isNaN(order)) data.order = order;

    const updated = await prisma.jobPosition.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[JobPositions PUT Error]:", error);
    return NextResponse.json({ error: "Lỗi cập nhật Vị trí việc làm" }, { status: 500 });
  }
}
