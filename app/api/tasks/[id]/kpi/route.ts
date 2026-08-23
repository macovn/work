import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = params.id;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    }

    // Task must be in COMPLETED status
    if (task.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Chỉ công việc đã Hoàn thành mới đủ điều kiện chấm điểm KPI" },
        { status: 400 }
      );
    }

    // RBAC: Only ADMIN can evaluate KPI
    if (currentUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Bạn không có quyền chấm điểm KPI cho công việc này" },
        { status: 403 }
      );
    }

    // Assignee cannot evaluate their own task
    if (task.assigneeId === currentUser.id) {
      return NextResponse.json(
        { error: "Người thực hiện không được tự chấm điểm KPI cho chính mình" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { kpiQuantity, kpiProgress, kpiQuality, kpiComment } = body;

    // Validation: 3 criteria are mandatory numbers between 0 and 100
    const isValidScore = (val: any) => typeof val === "number" && !isNaN(val) && val >= 0 && val <= 100;

    if (!isValidScore(kpiQuantity) || !isValidScore(kpiProgress) || !isValidScore(kpiQuality)) {
      return NextResponse.json(
        { error: "Bắt buộc phải nhập đầy đủ 3 tiêu chí điểm (Số lượng, Tiến độ, Chất lượng) từ 0 đến 100" },
        { status: 400 }
      );
    }

    // Calculate overall KPI percentage: (Quantity + Progress + Quality) / 3
    const rawKpi = (kpiQuantity + kpiProgress + kpiQuality) / 3;
    const kpiScore = Number(rawKpi.toFixed(2));

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        kpiQuantity,
        kpiProgress,
        kpiQuality,
        kpiScore,
        kpiEvaluatorId: currentUser.id,
        kpiEvaluatedAt: new Date(),
        kpiComment: kpiComment ? String(kpiComment).trim() : null,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
        kpiEvaluator: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return NextResponse.json({
      message: "Chấm điểm KPI công việc thành công",
      task: updatedTask,
    });
  } catch (error: any) {
    console.error("[Task KPI Evaluation API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi khi chấm điểm KPI công việc" },
      { status: 500 }
    );
  }
}
