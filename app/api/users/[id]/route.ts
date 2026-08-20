import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";

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
    const { fullName, role, status, password } = body;

    const data: any = {};
    if (fullName) data.fullName = fullName.trim();
    if (role && (role === "ADMIN" || role === "USER")) data.role = role;
    if (status && (status === "ACTIVE" || status === "LOCKED")) data.status = status;
    if (password) data.passwordHash = await hashPassword(password);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
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
