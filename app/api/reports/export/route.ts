import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const now = new Date();
    const tasks = await prisma.task.findMany({
      include: { assignee: true },
    });

    const fieldMap: Record<
      string,
      { total: number; completed: number; inProgress: number; overdue: number }
    > = {};

    const userMap: Record<
      string,
      { name: string; total: number; completed: number; inProgress: number; overdue: number }
    > = {};

    for (const t of tasks) {
      const field = t.field || "Khác";
      if (!fieldMap[field]) {
        fieldMap[field] = { total: 0, completed: 0, inProgress: 0, overdue: 0 };
      }
      fieldMap[field].total += 1;
      if (t.status === "COMPLETED") fieldMap[field].completed += 1;
      if (t.status === "IN_PROGRESS") fieldMap[field].inProgress += 1;
      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < now) {
        fieldMap[field].overdue += 1;
      }

      const userId = t.assigneeId;
      const userName = t.assignee?.fullName || "Chưa phân công";
      if (!userMap[userId]) {
        userMap[userId] = { name: userName, total: 0, completed: 0, inProgress: 0, overdue: 0 };
      }
      userMap[userId].total += 1;
      if (t.status === "COMPLETED") userMap[userId].completed += 1;
      if (t.status === "IN_PROGRESS") userMap[userId].inProgress += 1;
      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < now) {
        userMap[userId].overdue += 1;
      }
    }

function sanitizeExcelValue(val: any): any {
  if (typeof val === "string") {
    if (/^[=+\-@\t\r]/.test(val)) {
      return `'${val}`;
    }
  }
  return val;
}

    const fieldRows = Object.entries(fieldMap).map(([field, stat]) => ({
      "Lĩnh vực": sanitizeExcelValue(field),
      "Tổng số công việc": stat.total,
      "Hoàn thành": stat.completed,
      "Đang thực hiện": stat.inProgress,
      "Quá hạn": stat.overdue,
    }));

    const userRows = Object.values(userMap).map((stat) => ({
      "Nhân sự": sanitizeExcelValue(stat.name),
      "Tổng số công việc được giao": stat.total,
      "Hoàn thành": stat.completed,
      "Đang thực hiện": stat.inProgress,
      "Quá hạn": stat.overdue,
    }));

    const wb = XLSX.utils.book_new();
    const wsField = XLSX.utils.json_to_sheet(fieldRows);
    const wsUser = XLSX.utils.json_to_sheet(userRows);

    XLSX.utils.book_append_sheet(wb, wsField, "Báo cáo theo Lĩnh vực");
    XLSX.utils.book_append_sheet(wb, wsUser, "Báo cáo theo Nhân sự");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Bao_Cao_Quan_Ly_Cong_Viec.xlsx"',
      },
    });
  } catch (error: any) {
    console.error("[Report Export API Error]:", error);
    return NextResponse.json({ error: "Lỗi xuất báo cáo Excel" }, { status: 500 });
  }
}
