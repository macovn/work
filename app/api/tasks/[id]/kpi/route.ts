import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  isExecutive,
  canSelfEvaluate,
  canDepartmentHeadAdjustKpi,
  canExecutiveAdjustKpi,
} from "@/lib/permissions";

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
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true, department: true, workLocation: true },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    }

    // Task must be in COMPLETED status
    if (task.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Chỉ công việc đã Hoàn thành mới đủ điều kiện chấm / điều chỉnh điểm KPI" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      mode,
      kpiQuantity,
      kpiProgress,
      kpiQuality,
      kpiComment,
      selfKpiComment,
      directorEvidence,
      directorComment,
    } = body;

    // Validation: 3 criteria are mandatory numbers between 0 and 100
    const isValidScore = (val: any) => typeof val === "number" && !isNaN(val) && val >= 0 && val <= 100;

    const quantityNum = Number(kpiQuantity);
    const progressNum = Number(kpiProgress);
    const qualityNum = Number(kpiQuality);

    if (!isValidScore(quantityNum) || !isValidScore(progressNum) || !isValidScore(qualityNum)) {
      return NextResponse.json(
        { error: "Bắt buộc phải nhập đầy đủ 3 tiêu chí điểm (Số lượng, Tiến độ, Chất lượng) từ 0 đến 100" },
        { status: 400 }
      );
    }

    const calculatedScore = Number(((quantityNum + progressNum + qualityNum) / 3).toFixed(2));

    // =========================================================================
    // TRƯỜNG HỢP 1: Cá nhân được giao việc TỰ CHẤM ĐIỂM KPI (Self-Evaluation)
    // =========================================================================
    const isSelfEvaluating = currentUser.id === task.assigneeId && (mode === "SELF" || (!isExecutive(currentUser.role) && currentUser.role !== "DEPARTMENT_HEAD"));

    if (isSelfEvaluating) {
      const comment = (selfKpiComment ?? kpiComment ?? "").toString().trim() || null;

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          selfKpiQuantity: quantityNum,
          selfKpiProgress: progressNum,
          selfKpiQuality: qualityNum,
          selfKpiScore: calculatedScore,
          selfKpiComment: comment,
          selfKpiEvaluatedAt: new Date(),
          // Nếu Phụ trách bộ phận chưa chính thức duyệt/chấm điểm, lấy điểm tự chấm làm điểm cơ sở ban đầu
          ...(!task.kpiEvaluatedAt
            ? {
                kpiQuantity: quantityNum,
                kpiProgress: progressNum,
                kpiQuality: qualityNum,
                kpiScore: calculatedScore,
                kpiComment: comment ? `[Cá nhân tự chấm]: ${comment}` : null,
              }
            : {}),
        },
        include: {
          assignee: { select: { id: true, fullName: true, email: true, department: true } },
          kpiEvaluator: { select: { id: true, fullName: true, email: true } },
          directorAdjuster: { select: { id: true, fullName: true, email: true } },
        },
      });

      return NextResponse.json({
        message: "Cá nhân tự chấm điểm KPI thành công",
        task: updatedTask,
      });
    }

    // =========================================================================
    // TRƯỜNG HỢP 2: Giám đốc, Phó Giám đốc ĐỀ NGHỊ ĐIỀU CHỈNH ĐIỂM KPI KHI CÓ BẰNG CHỨNG
    // =========================================================================
    const isDirectorAdjusting = isExecutive(currentUser.role) && (mode === "DIRECTOR_ADJUST" || Boolean(directorEvidence));

    if (isDirectorAdjusting) {
      const evidence = (directorEvidence ?? "").toString().trim();
      if (!evidence) {
        return NextResponse.json(
          {
            error: "Bắt buộc phải cung cấp bằng chứng cụ thể khi Ban Giám đốc đề nghị điều chỉnh điểm KPI (ví dụ: Biên bản kiểm tra, đối soát số liệu BHYT/HIS...)",
          },
          { status: 400 }
        );
      }

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          kpiQuantity: quantityNum,
          kpiProgress: progressNum,
          kpiQuality: qualityNum,
          kpiScore: calculatedScore,
          directorEvidence: evidence,
          directorComment: (directorComment ?? kpiComment ?? "").toString().trim() || null,
          directorAdjusterId: currentUser.id,
          directorAdjustedAt: new Date(),
        },
        include: {
          assignee: { select: { id: true, fullName: true, email: true, department: true } },
          kpiEvaluator: { select: { id: true, fullName: true, email: true } },
          directorAdjuster: { select: { id: true, fullName: true, email: true } },
        },
      });

      return NextResponse.json({
        message: "Ban Giám đốc đã điều chỉnh điểm KPI theo bằng chứng kiểm chứng thành công",
        task: updatedTask,
      });
    }

    // =========================================================================
    // TRƯỜNG HỢP 3: Người phụ trách bộ phận ĐIỀU CHỈNH / DUYỆT ĐIỂM KPI CỦA NHÂN VIÊN
    // =========================================================================
    const isDeptHeadAdjusting =
      currentUser.role === "DEPARTMENT_HEAD" ||
      (isExecutive(currentUser.role) && mode !== "SELF");

    if (isDeptHeadAdjusting) {
      if (currentUser.role === "DEPARTMENT_HEAD") {
        if (task.assigneeId === currentUser.id) {
          return NextResponse.json(
            { error: "Người phụ trách bộ phận không được tự duyệt cho chính mình (vui lòng chọn tab Tự chấm điểm hoặc chuyển Ban Giám đốc duyệt)" },
            { status: 403 }
          );
        }

        const sameDept =
          currentUser.department &&
          task.assignee?.department &&
          currentUser.department.trim().toLowerCase() === task.assignee.department.trim().toLowerCase();

        if (!sameDept) {
          return NextResponse.json(
            { error: "Phụ trách bộ phận chỉ có quyền duyệt và điều chỉnh điểm KPI của nhân viên thuộc bộ phận mình" },
            { status: 403 }
          );
        }
      }

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          kpiQuantity: quantityNum,
          kpiProgress: progressNum,
          kpiQuality: qualityNum,
          kpiScore: calculatedScore,
          kpiEvaluatorId: currentUser.id,
          kpiEvaluatedAt: new Date(),
          kpiComment: (kpiComment ?? "").toString().trim() || null,
        },
        include: {
          assignee: { select: { id: true, fullName: true, email: true, department: true } },
          kpiEvaluator: { select: { id: true, fullName: true, email: true } },
          directorAdjuster: { select: { id: true, fullName: true, email: true } },
        },
      });

      return NextResponse.json({
        message: "Người phụ trách bộ phận đã duyệt / điều chỉnh điểm KPI thành công",
        task: updatedTask,
      });
    }

    return NextResponse.json(
      { error: "Bạn không có quyền thực hiện thao tác chấm điểm KPI này" },
      { status: 403 }
    );
  } catch (error: any) {
    console.error("[Task KPI Evaluation API Error]:", error);
    return NextResponse.json(
      { error: "Lỗi khi chấm / điều chỉnh điểm KPI công việc" },
      { status: 500 }
    );
  }
}
