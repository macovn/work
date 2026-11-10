import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { isManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !isManager(currentUser.role)) {
      return NextResponse.json({ error: "Chỉ cấp quản lý mới có quyền truy cập" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        zaloId: true,
        staffCode: true,
        positionId: true,
        position: {
          select: {
            id: true,
            code: true,
            name: true,
            careerRank: true,
          },
        },
        qualification: true,
        department: true,
        workLocation: true,
        concurrentHours: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("[Users GET API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi lấy danh sách người dùng" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền tạo người dùng" }, { status: 403 });
    }

    const body = await request.json();
    const {
      email,
      password,
      fullName,
      role,
      status,
      zaloId,
      staffCode,
      positionId,
      qualification,
      department,
      workLocation,
      concurrentHours,
    } = body;

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json({ error: "Email này đã được sử dụng" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const VALID_ROLES = ["ADMIN", "DIRECTOR", "DEPUTY_DIRECTOR", "DEPARTMENT_HEAD", "USER"];
    const targetRole = VALID_ROLES.includes(role) ? role : "USER";

    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName.trim(),
        role: targetRole as any,
        status: status === "LOCKED" ? "LOCKED" : "ACTIVE",
        zaloId: zaloId && String(zaloId).trim() ? String(zaloId).trim() : null,
        staffCode: staffCode && String(staffCode).trim() ? String(staffCode).trim() : null,
        positionId: positionId || null,
        qualification: qualification && String(qualification).trim() ? String(qualification).trim() : null,
        department: department && String(department).trim() ? String(department).trim() : "Khám bệnh",
        workLocation: workLocation && String(workLocation).trim() ? String(workLocation).trim() : "Trạm chính",
        concurrentHours: concurrentHours !== undefined && concurrentHours !== null ? Number(concurrentHours) : 120,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        zaloId: true,
        staffCode: true,
        positionId: true,
        position: { select: { id: true, code: true, name: true, careerRank: true } },
        qualification: true,
        department: true,
        workLocation: true,
        concurrentHours: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ message: "Tạo tài khoản thành công", user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error("[Users POST API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi tạo tài khoản" }, { status: 500 });
  }
}
