import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "@/lib/google-calendar";
import { NotificationEngine } from "@/lib/notification-engine";

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
      // User can only update their own task's status, result, notes
      if (task.assigneeId !== user.id) {
        return NextResponse.json({ error: "Bạn không có quyền chỉnh sửa công việc này" }, { status: 403 });
      }

      const { status, result, notes } = body;
      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(status && { status }),
          ...(result !== undefined && { result }),
          ...(notes !== undefined && { notes }),
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
    const { code, title, field, assigneeId, deadline, priority, taskType, status, result, notes } = body;

    if (taskType !== undefined && taskType !== "RECURRING" && taskType !== "AD_HOC") {
      return NextResponse.json({ error: "Loại công việc không hợp lệ (RECURRING hoặc AD_HOC)" }, { status: 400 });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(code && { code: code.trim() }),
        ...(title && { title: title.trim() }),
        ...(field && { field: field.trim() }),
        ...(assigneeId && { assigneeId }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(priority && { priority }),
        ...(taskType && { taskType }),
        ...(status && { status }),
        ...(result !== undefined && { result }),
        ...(notes !== undefined && { notes }),
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

    NotificationEngine.evaluateAndTriggerNotifications().catch((err) => {
      console.error("[Post Patch Notification Error]:", err);
    });

    return NextResponse.json({ message: "Cập nhật công việc thành công", task: updatedTask });
  } catch (error: any) {
    console.error("[Tasks PATCH API Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi khi cập nhật công việc" }, { status: 500 });
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
