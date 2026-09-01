import { NextResponse } from "next/server";
import { prisma, ensureTaskTypeColumn } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureTaskTypeColumn();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const endOf3Days = new Date(startOfToday.getTime() + 4 * 24 * 60 * 60 * 1000 - 1);

    // Scoped based on RBAC (Admin sees all system tasks, User sees assigned tasks)
    const baseWhere = user.role === "ADMIN" ? {} : { assigneeId: userId };

    const [
      overdueCount,
      todayCount,
      next3DaysCount,
      completedTodayCount,
      userTasks,
    ] = await Promise.all([
      // 1. Quá hạn: chưa xong & deadline < startOfToday
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { lt: startOfToday },
        },
      }),

      // 2. Hôm nay: chưa xong & deadline trong ngày hôm nay
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { gte: startOfToday, lte: endOfToday },
        },
      }),

      // 3. 3 ngày tới: chưa xong & deadline trong 3 ngày tiếp theo
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { gt: endOfToday, lte: endOf3Days },
        },
      }),

      // 4. Đã hoàn thành hôm nay: status = COMPLETED & updatedAt trong ngày
      prisma.task.count({
        where: {
          ...baseWhere,
          status: "COMPLETED",
          updatedAt: { gte: startOfToday, lte: endOfToday },
        },
      }),

      // Fetch user's active tasks for summary list & chart
      prisma.task.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ["CANCELLED"] },
        },
        include: {
          assignee: {
            select: { id: true, fullName: true, email: true },
          },
          kpiEvaluator: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
    ]);

    const activeIncompleteCount = overdueCount + todayCount + next3DaysCount;
    const totalCount = activeIncompleteCount + completedTodayCount;

    // Classify & sort tasks: Overdue -> Today -> Next 3 Days -> Other
    const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    const classifiedTasks = userTasks.map((t) => {
      const d = new Date(t.deadline);
      let group = "OTHER";
      let timeBadgeText = "";
      let isOverdue = false;
      let daysOverdue = 0;
      let daysRemaining = 0;

      if (t.status !== "COMPLETED") {
        if (d < startOfToday) {
          group = "OVERDUE";
          isOverdue = true;
          const diffMs = startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          daysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          timeBadgeText = daysOverdue > 1 ? `Quá hạn - Hơn ${daysOverdue} ngày` : "Quá hạn 1 ngày";
        } else if (d >= startOfToday && d <= endOfToday) {
          group = "TODAY";
          timeBadgeText = "Hạn hôm nay";
        } else if (d > endOfToday && d <= endOf3Days) {
          group = "NEXT_3_DAYS";
          const diffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startOfToday.getTime();
          daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          timeBadgeText = `Còn ${daysRemaining} ngày`;
        } else {
          group = "OTHER";
          const diffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startOfToday.getTime();
          daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          timeBadgeText = `Còn ${daysRemaining} ngày`;
        }
      } else {
        group = "COMPLETED";
        timeBadgeText = "Đã hoàn thành";
      }

      return {
        ...t,
        group,
        isOverdue,
        daysOverdue,
        daysRemaining,
        timeBadgeText,
      };
    });

    // Group order score: OVERDUE (1) -> TODAY (2) -> NEXT_3_DAYS (3) -> OTHER (4) -> COMPLETED (5)
    const groupOrder: Record<string, number> = {
      OVERDUE: 1,
      TODAY: 2,
      NEXT_3_DAYS: 3,
      OTHER: 4,
      COMPLETED: 5,
    };

    classifiedTasks.sort((a, b) => {
      const gA = groupOrder[a.group] || 99;
      const gB = groupOrder[b.group] || 99;
      if (gA !== gB) return gA - gB;

      // Same group -> sort by priority HIGH -> LOW
      const pA = priorityWeight[a.priority as keyof typeof priorityWeight] || 1;
      const pB = priorityWeight[b.priority as keyof typeof priorityWeight] || 1;
      if (pA !== pB) return pB - pA;

      // Same priority -> sort by deadline ascending
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    // Chart distribution percentages
    const totalChartItems = activeIncompleteCount || 1;
    const overduePercent = Math.round((overdueCount / totalChartItems) * 100);
    const todayPercent = Math.round((todayCount / totalChartItems) * 100);
    const next3DaysPercent = Math.round((next3DaysCount / totalChartItems) * 100);
    const otherCount = Math.max(0, activeIncompleteCount - overdueCount - todayCount - next3DaysCount);
    const otherPercent = Math.max(0, 100 - overduePercent - todayPercent - next3DaysPercent);

    // Suggestions list
    const suggestions = [];
    if (todayCount > 0) {
      suggestions.push({
        id: "sug-today",
        type: "TODAY",
        count: todayCount,
        title: `${todayCount} việc cần xử lý trong hôm nay`,
        subtitle: "Ưu tiên hoàn thành để đảm bảo tiến độ.",
      });
    }
    if (overdueCount > 0) {
      suggestions.push({
        id: "sug-overdue",
        type: "OVERDUE",
        count: overdueCount,
        title: `${overdueCount} việc đã quá hạn`,
        subtitle: "Xem xét xử lý sớm để tránh ảnh hưởng.",
      });
    }
    if (next3DaysCount > 0) {
      suggestions.push({
        id: "sug-next3days",
        type: "NEXT_3_DAYS",
        count: next3DaysCount,
        title: `${next3DaysCount} việc sắp đến hạn trong 3 ngày tới`,
        subtitle: "Chuẩn bị và theo dõi sát sao.",
      });
    }
    if (suggestions.length === 0) {
      suggestions.push({
        id: "sug-empty",
        type: "NONE",
        count: 0,
        title: "Hiện tại không có việc khẩn cấp",
        subtitle: "Tình hình công việc của bạn rất ổn định!",
      });
    }

    return NextResponse.json({
      summary: {
        overdue: overdueCount,
        today: todayCount,
        next3Days: next3DaysCount,
        completedToday: completedTodayCount,
        total: activeIncompleteCount,
      },
      chartStats: {
        total: activeIncompleteCount,
        overdueCount,
        overduePercent: activeIncompleteCount > 0 ? overduePercent : 0,
        todayCount,
        todayPercent: activeIncompleteCount > 0 ? todayPercent : 0,
        next3DaysCount,
        next3DaysPercent: activeIncompleteCount > 0 ? next3DaysPercent : 0,
        otherCount,
        otherPercent: activeIncompleteCount > 0 ? otherPercent : 0,
      },
      suggestions,
      tasks: classifiedTasks,
    });
  } catch (error: any) {
    console.error("[Work Summary API Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi khi lấy bảng tổng hợp công việc" },
      { status: 500 }
    );
  }
}
