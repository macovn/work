import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền cập nhật người dùng" }, { status: 403 });
    }

    const userId = params.id;
    const body = await request.json();
    const {
      email,
      fullName,
      role,
      status,
      password,
      zaloId,
      staffCode,
      positionId,
      qualification,
      department,
      workLocation,
      concurrentHours,
    } = body;

    const data: any = {};

    // Bảo vệ Admin tối cao: chặn tự hạ quyền hoặc tự khóa tài khoản chính mình
    if (userId === currentUser.id) {
      if (role === "USER") {
        return NextResponse.json(
          { error: "Bạn không thể tự hạ quyền tài khoản Admin của chính mình" },
          { status: 400 }
        );
      }
      if (status === "LOCKED") {
        return NextResponse.json(
          { error: "Bạn không thể tự khóa tài khoản của chính mình" },
          { status: 400 }
        );
      }
    }

    if (email && typeof email === "string" && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const existingUser = await prisma.user.findFirst({
        where: {
          email: cleanEmail,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        return NextResponse.json({ error: "Email này đã được sử dụng bởi tài khoản khác" }, { status: 400 });
      }
      data.email = cleanEmail;
    }

    const VALID_ROLES = ["ADMIN", "DIRECTOR", "DEPUTY_DIRECTOR", "DEPARTMENT_HEAD", "USER"];

    if (fullName) data.fullName = fullName.trim();
    if (role && VALID_ROLES.includes(role)) data.role = role as any;
    if (status && (status === "ACTIVE" || status === "LOCKED")) data.status = status;
    if (password) data.passwordHash = await hashPassword(password);
    if (zaloId !== undefined) {
      data.zaloId = zaloId && String(zaloId).trim() ? String(zaloId).trim() : null;
    }
    if (staffCode !== undefined) {
      data.staffCode = staffCode && String(staffCode).trim() ? String(staffCode).trim() : null;
    }
    if (positionId !== undefined) {
      data.positionId = positionId || null;
    }
    if (qualification !== undefined) {
      data.qualification = qualification && String(qualification).trim() ? String(qualification).trim() : null;
    }
    if (department !== undefined) {
      data.department = department && String(department).trim() ? String(department).trim() : "Khám bệnh";
    }
    if (workLocation !== undefined) {
      data.workLocation = workLocation && String(workLocation).trim() ? String(workLocation).trim() : "Trạm chính";
    }
    if (concurrentHours !== undefined) {
      data.concurrentHours = concurrentHours !== null ? Number(concurrentHours) : 120;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
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
        updatedAt: true,
      },
    });

    return NextResponse.json({ message: "Cập nhật tài khoản thành công", user: updatedUser });
  } catch (error: any) {
    console.error("[Users PATCH API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi cập nhật tài khoản" }, { status: 500 });
  }
}
