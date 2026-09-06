import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "@/lib/google-calendar";
import { NotificationEngine } from "@/lib/notification-engine";
import { fromLocalInputValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = params.id;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    }

    const body = await request.json();

    if (user.role !== "ADMIN") {
      // User can update status, result, notes, completedVolume
      if (task.assigneeId !== user.id) {
        return NextResponse.json({ error: "Bạn không có quyền chỉnh sửa công việc này" }, { status: 403 });
      }

      const { status, result, notes, completedVolume } = body;

      // Audit H5: task COMPLETED hoặc đã chấm KPI bị đóng băng — USER không được
      // đổi trạng thái/khối lượng (chỉ Admin mở lại). result/notes vẫn chỉnh được.
      const parsedCompletedVol = completedVolume !== undefined ? (completedVolume !== null ? Number(completedVolume) : null) : task.completedVolume;
      const statusChanged = status !== undefined && status !== task.status;
      const volumeChanged = completedVolume !== undefined && parsedCompletedVol !== task.completedVolume;
      const taskLocked = task.status === "COMPLETED" || task.kpiEvaluatedAt !== null;
      if (taskLocked && (statusChanged || volumeChanged)) {
        return NextResponse.json(
          { error: "Công việc đã hoàn thành hoặc đã chấm điểm KPI — chỉ Admin mới được điều chỉnh trạng thái/khối lượng" },
          { status: 403 }
        );
      }

      // Audit M3: khối lượng phải là số không âm.
      if (parsedCompletedVol !== null && (!isFinite(parsedCompletedVol) || parsedCompletedVol < 0)) {
        return NextResponse.json({ error: "Khối lượng hoàn thành phải là số không âm" }, { status: 400 });
      }

      let newCompletedScore = task.completedScore;
      let newCompletionRate = task.completionRate;

      if (completedVolume !== undefined) {
        if (parsedCompletedVol === null) {
          // Xóa khối lượng => xóa luôn snapshot điểm tránh số liệu cũ sót lại (audit M3).
          newCompletedScore = null;
          newCompletionRate = null;
        } else if (task.benchmarkScore != null && task.conversionFactor != null) {
          newCompletedScore = Number((parsedCompletedVol * task.benchmarkScore * task.conversionFactor).toFixed(2));
          if (task.assignedScore != null && task.assignedScore > 0) {
            newCompletionRate = Number(((newCompletedScore / task.assignedScore) * 100).toFixed(2));
          } else {
            newCompletionRate = null;
          }
        } else {
          // Thiếu benchmark/hệ số snapshot => không để giá trị cũ sót lại.
          newCompletedScore = null;
          newCompletionRate = null;
        }
      }

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(status && { status }),
          ...(result !== undefined && { result }),
          ...(notes !== undefined && { notes }),
          ...(completedVolume !== undefined && {
            completedVolume: parsedCompletedVol,
            completedScore: newCompletedScore,
            completionRate: newCompletionRate,
          }),
        },
        include: {
          assignee: {
            select: { id: true, fullName: true, email: true },
          },
          kpiEvaluator: {
            select: { id: true, fullName: true, email: true },
          },
          position: { select: { id: true, name: true, code: true } },
          group: { select: { id: true, name: true, code: true } },
          standardTask: { select: { id: true, name: true, code: true, unit: true, benchmarkScore: true, complexityLevel: true, conversionFactor: true } },
        },
      });

      if (updatedTask.googleEventId) {
        updateGoogleCalendarEvent(updatedTask.googleEventId, {
          code: updatedTask.code,
          title: updatedTask.title,
          deadline: updatedTask.deadline,
          field: updatedTask.field,
          priority: updatedTask.priority,
          taskType: updatedTask.taskType,
          status: updatedTask.status,
          notes: updatedTask.notes,
        }).catch((err) => console.error("[Google Calendar Patch Error]:", err));
      }

      return NextResponse.json({ message: "Cập nhật thành công", task: updatedTask });
    }

    // Admin update
    const {
      code,
      title,
      field,
      assigneeId,
      deadline,
      priority,
      taskType,
      status,
      result,
      notes,
      positionId,
      groupId,
      standardTaskId,
      unit,
      benchmarkScore,
      complexityLevel,
      conversionFactor,
      assignedVolume,
      completedVolume,
    } = body;

    if (taskType !== undefined && taskType !== "RECURRING" && taskType !== "AD_HOC") {
      return NextResponse.json({ error: "Loại công việc không hợp lệ (RECURRING hoặc AD_HOC)" }, { status: 400 });
    }

    let snapPositionId = positionId !== undefined ? positionId : task.positionId;
    let snapGroupId = groupId !== undefined ? groupId : task.groupId;
    let snapStandardTaskId = standardTaskId !== undefined ? standardTaskId : task.standardTaskId;
    let snapUnit = unit !== undefined ? unit : task.unit;
    let snapBenchmarkScore = benchmarkScore !== undefined ? (benchmarkScore !== null ? Number(benchmarkScore) : null) : task.benchmarkScore;
    let snapComplexityLevel = complexityLevel !== undefined ? complexityLevel : task.complexityLevel;
    let snapConversionFactor = conversionFactor !== undefined ? (conversionFactor !== null ? Number(conversionFactor) : null) : task.conversionFactor;

    // Deadline naive được hiểu theo giờ Việt Nam (audit H7).
    let parsedDeadline: Date | null = null;
    if (deadline !== undefined) {
      parsedDeadline = fromLocalInputValue(deadline);
      if (!parsedDeadline) {
        return NextResponse.json({ error: "Deadline không hợp lệ" }, { status: 400 });
      }
    }

    if (standardTaskId && standardTaskId !== task.standardTaskId) {
      const stdTask = await prisma.standardTask.findUnique({
        where: { id: standardTaskId },
      });
      if (stdTask) {
        snapPositionId = stdTask.positionId;
        snapGroupId = stdTask.groupId;
        snapStandardTaskId = stdTask.id;
        snapUnit = stdTask.unit;
        snapBenchmarkScore = stdTask.benchmarkScore;
        snapComplexityLevel = stdTask.complexityLevel;
        snapConversionFactor = stdTask.conversionFactor;
      }
    }

    const parsedAssignedVol = assignedVolume !== undefined ? (assignedVolume !== null ? Number(assignedVolume) : null) : task.assignedVolume;
    const parsedCompletedVol = completedVolume !== undefined ? (completedVolume !== null ? Number(completedVolume) : null) : task.completedVolume;

    // Audit M3: từ chối số âm/NaN.
    if (parsedAssignedVol !== null && (!isFinite(parsedAssignedVol) || parsedAssignedVol < 0)) {
      return NextResponse.json({ error: "Khối lượng giao phải là số không âm" }, { status: 400 });
    }
    if (parsedCompletedVol !== null && (!isFinite(parsedCompletedVol) || parsedCompletedVol < 0)) {
      return NextResponse.json({ error: "Khối lượng hoàn thành phải là số không âm" }, { status: 400 });
    }
    const assignedVolProvided = assignedVolume !== undefined;
    const completedVolProvided = completedVolume !== undefined;

    let assignedScore = task.assignedScore;
    let completedScore = task.completedScore;
    let completionRate = task.completionRate;

    if (snapBenchmarkScore !== null && snapConversionFactor !== null) {
      if (parsedAssignedVol !== null && parsedCompletedVol !== null) {
        assignedScore = Number((parsedAssignedVol * snapBenchmarkScore * snapConversionFactor).toFixed(2));
        completedScore = Number((parsedCompletedVol * snapBenchmarkScore * snapConversionFactor).toFixed(2));
        if (assignedScore > 0) {
          completionRate = Number(((completedScore / assignedScore) * 100).toFixed(2));
        } else if (assignedScore === 0 && completedScore === 0) {
          completionRate = 100; // Quyết định chủ dự án: giữ 0/0 = 100
        } else {
          completionRate = null;
        }
      } else if (parsedAssignedVol !== null) {
        assignedScore = Number((parsedAssignedVol * snapBenchmarkScore * snapConversionFactor).toFixed(2));
        completedScore = null;
        completionRate = null;
      } else if (parsedCompletedVol !== null) {
        completedScore = Number((parsedCompletedVol * snapBenchmarkScore * snapConversionFactor).toFixed(2));
        completionRate = null;
      } else {
        assignedScore = null;
        completedScore = null;
        completionRate = null;
      }
    } else {
      // Thiếu benchmark/hệ số: chỉ dọn snapshot khi người dùng thực sự đổi volume (audit M3).
      if (assignedVolProvided) {
        assignedScore = null;
        completionRate = null;
      }
      if (completedVolProvided) {
        completedScore = null;
        completionRate = null;
      }
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(code && { code: code.trim() }),
        ...(title && { title: title.trim() }),
        ...(field && { field: field.trim() }),
        ...(assigneeId && { assigneeId }),
        ...(parsedDeadline && { deadline: parsedDeadline }),
        ...(priority && { priority }),
        ...(taskType && { taskType }),
        ...(status && { status }),
        ...(result !== undefined && { result }),
        ...(notes !== undefined && { notes }),
        positionId: snapPositionId,
        groupId: snapGroupId,
        standardTaskId: snapStandardTaskId,
        unit: snapUnit,
        benchmarkScore: snapBenchmarkScore,
        complexityLevel: snapComplexityLevel,
        conversionFactor: snapConversionFactor,
        assignedVolume: parsedAssignedVol,
        completedVolume: parsedCompletedVol,
        assignedScore,
        completedScore,
        completionRate,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
        kpiEvaluator: {
          select: { id: true, fullName: true, email: true },
        },
        position: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, code: true } },
        standardTask: { select: { id: true, name: true, code: true, unit: true, benchmarkScore: true, complexityLevel: true, conversionFactor: true } },
      },
    });

    // Handle Google Calendar sync
    if (updatedTask.googleEventId) {
      if (updatedTask.status === "CANCELLED") {
        deleteGoogleCalendarEvent(updatedTask.googleEventId).catch((err) =>
          console.error("[Google Calendar Delete Event Error]:", err)
        );
      } else {
        updateGoogleCalendarEvent(updatedTask.googleEventId, {
          code: updatedTask.code,
          title: updatedTask.title,
          deadline: updatedTask.deadline,
          field: updatedTask.field,
          priority: updatedTask.priority,
          taskType: updatedTask.taskType,
          status: updatedTask.status,
          notes: updatedTask.notes,
        }).catch((err) => console.error("[Google Calendar Patch Error]:", err));
      }
    }

    // Audit M1: chỉ đánh giá riêng task vừa cập nhật.
    NotificationEngine.evaluateTaskNow(updatedTask.id);

    return NextResponse.json({ message: "Cập nhật công việc thành công", task: updatedTask });
  } catch (error: any) {
    console.error("[Tasks PATCH API Error]:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Mã công việc đã tồn tại" }, { status: 409 });
    }
    return NextResponse.json({ error: "Lỗi khi cập nhật công việc" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền xóa công việc" }, { status: 403 });
    }

    const taskId = params.id;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    }

    if (task.googleEventId) {
      deleteGoogleCalendarEvent(task.googleEventId).catch((err) =>
        console.error("[Google Calendar Delete Event Error]:", err)
      );
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    return NextResponse.json({ message: "Đã xóa công việc" });
  } catch (error: any) {
    console.error("[Tasks DELETE API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi xóa công việc" }, { status: 500 });
  }
}
