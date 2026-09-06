import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { calculateEvaluation } from "@/lib/evaluation";
import { APP_UTC_OFFSET_MS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assigneeId = searchParams.get("assigneeId") || undefined;
    const positionId = searchParams.get("positionId") || undefined;
    const field = searchParams.get("field") || undefined;
    const month = searchParams.get("month") || undefined; // YYYY-MM

    // RBAC: Non-admin users can only view their own evaluation
    const targetAssigneeId = user.role === "ADMIN" ? assigneeId : user.id;

    const where: any = {};
    if (targetAssigneeId) {
      where.assigneeId = targetAssigneeId;
    }
    if (positionId) {
      where.positionId = positionId;
    }
    if (field) {
      where.field = field;
    }

    if (month) {
      // Chỉ chấp nhận định dạng YYYY-MM hợp lệ (audit M16/H7) — không im lặng bỏ qua.
      const mm = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
      if (!mm) {
        return NextResponse.json({ error: "Tham số month không hợp lệ (định dạng YYYY-MM)" }, { status: 400 });
      }
      const year = parseInt(mm[1], 10);
      const m = parseInt(mm[2], 10);
      // Ranh giới tháng theo giờ Việt Nam (audit H7): [00:00 ngày 1, 00:00 ngày 1 tháng sau)
      const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0) - APP_UTC_OFFSET_MS);
      const endOfMonth = new Date(Date.UTC(year, m, 1, 0, 0, 0, 0) - APP_UTC_OFFSET_MS - 1);
      where.deadline = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 1. Overall evaluation for the queried dataset
    const overallEvaluation = calculateEvaluation(
      tasks.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        assignedScore: t.assignedScore,
        completedScore: t.completedScore,
        kpiScore: t.kpiScore,
        status: t.status,
      }))
    );

    // 2. Evaluation breakdown by employee
    const userTasksMap = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const uId = t.assigneeId;
      if (!userTasksMap.has(uId)) {
        userTasksMap.set(uId, []);
      }
      userTasksMap.get(uId)!.push(t);
    }

    const employeeEvaluations = Array.from(userTasksMap.entries()).map(([uId, uTasks]) => {
      const emp = uTasks[0]?.assignee;
      const evaluation = calculateEvaluation(
        uTasks.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          assignedScore: t.assignedScore,
          completedScore: t.completedScore,
          kpiScore: t.kpiScore,
          status: t.status,
        }))
      );
      return {
        user: emp,
        taskCount: uTasks.length,
        evaluation,
      };
    });

    return NextResponse.json({
      overall: overallEvaluation,
      byEmployee: employeeEvaluations,
      filter: {
        assigneeId: targetAssigneeId || null,
        positionId: positionId || null,
        field: field || null,
        month: month || null,
      },
    });
  } catch (error: any) {
    console.error("[Evaluation API Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi máy chủ nội bộ" }, { status: 500 });
  }
}
