import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canApproveTask } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(
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
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true, department: true },
        },
        creator: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Không tìm thấy công việc" }, { status: 404 });
    }

    // Kiểm tra quyền phê duyệt
    if (!canApproveTask(user, task)) {
      return NextResponse.json(
        { error: "Bạn không có quyền phê duyệt nhiệm vụ này (Chỉ Cán bộ phụ trách bộ phận hoặc Ban Giám đốc mới có quyền duyệt)." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, approvalNote } = body;

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { error: "Hành động không hợp lệ. Vui lòng chọn APPROVE hoặc REJECT." },
        { status: 400 }
      );
    }

    const isApprove = action === "APPROVE";
    const now = new Date();

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        approvalStatus: isApprove ? "APPROVED" : "REJECTED",
        approverId: user.id,
        approvedAt: now,
        approvalNote: approvalNote?.trim() || null,
        ...(isApprove ? {} : { status: "CANCELLED" }),
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true, department: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true },
        },
        creator: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    // Tạo thông báo In-app cho người thực hiện (viên chức)
    try {
      const notifTitle = isApprove
        ? "Nhiệm vụ đột xuất đã được phê duyệt"
        : "Nhiệm vụ đột xuất không được phê duyệt";
      const notifMsg = isApprove
        ? `Cán bộ phụ trách (${user.fullName}) đã phê duyệt nhiệm vụ "${task.title}". Bạn đã có thể triển khai thực hiện nhiệm vụ.`
        : `Cán bộ phụ trách (${user.fullName}) đã từ chối phê duyệt nhiệm vụ "${task.title}". Lý do: ${approvalNote?.trim() || "Không có lý do cụ thể"}.`;

      await prisma.inAppNotification.create({
        data: {
          userId: task.assigneeId,
          taskId: task.id,
          title: notifTitle,
          message: notifMsg,
        },
      });
    } catch (notifErr) {
      console.error("[Notification Error in Task Approve]:", notifErr);
    }

    return NextResponse.json({
      message: isApprove ? "Phê duyệt nhiệm vụ thành công" : "Đã từ chối nhiệm vụ",
      task: updatedTask,
    });
  } catch (error: any) {
    console.error("[Task Approve API Error]:", error);
    return NextResponse.json({ error: "Lỗi xử lý phê duyệt nhiệm vụ" }, { status: 500 });
  }
}
