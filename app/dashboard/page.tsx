import { redirect } from "next/navigation";
import { prisma, ensureTaskTypeColumn } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  CalendarDays,
  PauseCircle,
  FileQuestion,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Award,
} from "lucide-react";
import { formatDate, formatPriority, formatStatus } from "@/lib/utils";
import { calculateEvaluation, EvaluationResult } from "@/lib/evaluation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  await ensureTaskTypeColumn();
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const now = new Date();

  // Date thresholds
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Where clause based on RBAC
  const baseWhere = user.role === "ADMIN" ? {} : { assigneeId: user.id };

  let totalTasks = 0;
  let overdueTasks = 0;
  let dueTodayTasks = 0;
  let dueIn3DaysTasks = 0;
  let pausedTasks = 0;
  let unupdatedTasks = 0;
  let completedTasks = 0;
  let warningAttentionTasks: any[] = [];

  try {
    const [
      _totalTasks,
      _overdueTasks,
      _dueTodayTasks,
      _dueIn3DaysTasks,
      _pausedTasks,
      _unupdatedTasks,
      _completedTasks,
      _warningAttentionTasks,
    ] = await Promise.all([
      // 1. Tổng số công việc
      prisma.task.count({ where: baseWhere }),

      // 2. Quá hạn (deadline < now AND not completed AND not cancelled)
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { lt: now },
        },
      }),

      // 3. Đến hạn hôm nay (deadline inside today AND not completed AND not cancelled)
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { gte: startOfDay, lte: endOfDay },
        },
      }),

      // 4. Đến hạn trong 3 ngày (deadline inside next 3 days AND not completed AND not cancelled)
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { gte: now, lte: in3Days },
        },
      }),

      // 5. Tạm dừng
      prisma.task.count({
        where: {
          ...baseWhere,
          status: "PAUSED",
        },
      }),

      // 6. Chưa cập nhật (Result is null/empty AND status is TODO)
      prisma.task.count({
        where: {
          ...baseWhere,
          status: "TODO",
          OR: [{ result: null }, { result: "" }],
        },
      }),

      // 7. Hoàn thành (for completion rate calculation)
      prisma.task.count({
        where: {
          ...baseWhere,
          status: "COMPLETED",
        },
      }),

      // Query attention warning tasks (Overdue or Due in 24h)
      prisma.task.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          deadline: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        },
        include: {
          assignee: { select: { fullName: true } },
        },
        orderBy: { deadline: "asc" },
        take: 8,
      }),

      // 8. Tasks for Evaluation
      prisma.task.findMany({
        where: baseWhere,
        select: {
          id: true,
          code: true,
          title: true,
          assignedScore: true,
          completedScore: true,
          kpiScore: true,
          status: true,
        },
      }),
    ]);

    totalTasks = _totalTasks;
    overdueTasks = _overdueTasks;
    dueTodayTasks = _dueTodayTasks;
    dueIn3DaysTasks = _dueIn3DaysTasks;
    pausedTasks = _pausedTasks;
    unupdatedTasks = _unupdatedTasks;
    completedTasks = _completedTasks;
    warningAttentionTasks = _warningAttentionTasks;
  } catch (err) {
    console.error("[DashboardPage Data Fetch Error]:", err);
  }

  let evalTasks: any[] = [];
  try {
    evalTasks = await prisma.task.findMany({
      where: baseWhere,
      select: {
        id: true,
        code: true,
        title: true,
        assignedScore: true,
        completedScore: true,
        kpiScore: true,
        status: true,
      },
    });
  } catch (e) {
    console.error("[Dashboard evalTasks fetch error]:", e);
  }

  const dashboardEvaluation: EvaluationResult = calculateEvaluation(evalTasks);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const kpis = [
    {
      title: "Tổng số công việc",
      value: totalTasks,
      icon: CheckSquare,
      color: "bg-blue-500 text-white",
      borderColor: "border-blue-200",
    },
    {
      title: "Quá hạn",
      value: overdueTasks,
      icon: AlertTriangle,
      color: "bg-red-500 text-white",
      borderColor: "border-red-200",
      alert: overdueTasks > 0,
    },
    {
      title: "Đến hạn hôm nay",
      value: dueTodayTasks,
      icon: Clock,
      color: "bg-amber-500 text-white",
      borderColor: "border-amber-200",
    },
    {
      title: "Đến hạn trong 3 ngày",
      value: dueIn3DaysTasks,
      icon: CalendarDays,
      color: "bg-indigo-500 text-white",
      borderColor: "border-indigo-200",
    },
    {
      title: "Tạm dừng",
      value: pausedTasks,
      icon: PauseCircle,
      color: "bg-gray-500 text-white",
      borderColor: "border-gray-200",
    },
    {
      title: "Chưa cập nhật",
      value: unupdatedTasks,
      icon: FileQuestion,
      color: "bg-orange-500 text-white",
      borderColor: "border-orange-200",
    },
    {
      title: "Tỷ lệ hoàn thành",
      value: `${completionRate}%`,
      icon: TrendingUp,
      color: "bg-emerald-500 text-white",
      borderColor: "border-emerald-200",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Dashboard Chỉ Số KPI</h1>
        <p className="text-sm text-gray-500">
          Tổng quan tình hình thực hiện công việc {user?.role !== "ADMIN" && "(Việc được giao cho bạn)"}
        </p>
      </div>

      {/* KHỐI ĐÁNH GIÁ – XẾP LOẠI HIỆN TẠI */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Đánh Giá & Xếp Loại Kết Quả</h2>
              <p className="text-xs text-gray-500">
                {user?.role === "ADMIN" ? "Tổng hợp toàn đơn vị theo công thức chuẩn" : "Kết quả đánh giá cá nhân của bạn"}
              </p>
            </div>
          </div>
          <Link
            href="/reports"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 self-start sm:self-auto"
          >
            Chi tiết báo cáo <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {dashboardEvaluation.hasEnoughData ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-3.5 bg-gray-50/80 rounded-xl border border-gray-100">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Điểm TB (theo trọng số)
              </span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">
                {dashboardEvaluation.weightedAverageScore?.toFixed(2)}
              </span>
            </div>

            <div className="p-3.5 bg-purple-50/60 rounded-xl border border-purple-100">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                KPI Trung Bình
              </span>
              <span className="text-2xl font-black text-purple-700 mt-1 block">
                {dashboardEvaluation.averageKpi?.toFixed(2)}%
              </span>
            </div>

            <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-100">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                TỔNG ĐIỂM
              </span>
              <span className="text-2xl font-black text-blue-700 mt-1 block">
                {dashboardEvaluation.totalScore?.toFixed(2)}
              </span>
            </div>

            <div className={`p-3.5 rounded-xl border flex flex-col justify-center ${dashboardEvaluation.rating.bgColor} ${dashboardEvaluation.rating.borderColor}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${dashboardEvaluation.rating.textColor}`}>
                XẾP LOẠI
              </span>
              <span className={`inline-block mt-1 px-2.5 py-1 rounded-lg font-bold text-xs shadow-2xs ${dashboardEvaluation.rating.badgeColor}`}>
                {dashboardEvaluation.rating.label}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 border border-gray-200/80 rounded-xl text-xs text-gray-500 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span>Chưa đủ dữ liệu để đánh giá (cần có ít nhất 1 nhiệm vụ hoàn thành có điểm KPI).</span>
          </div>
        )}
      </div>

      {/* 7 KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`bg-white p-5 rounded-2xl border ${kpi.borderColor} shadow-sm hover:shadow-md transition flex items-center justify-between`}
            >
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{kpi.title}</p>
                <h3 className="text-2xl font-black text-gray-900">{kpi.value}</h3>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${kpi.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-5">
        <div
          className="relative w-32 h-32 shrink-0"
          role="img"
          aria-label={`Tỷ lệ hoàn thành ${completionRate}%`}
        >
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="#10b981"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${completionRate * 3.016} 301.6`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-gray-900">{completionRate}%</span>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Hoàn thành</span>
          </div>
        </div>
        <div className="text-center sm:text-left">
          <h2 className="text-base font-bold text-gray-900">Tiến độ công việc</h2>
          <p className="mt-1 text-sm text-gray-500">
            {completedTasks} trên {totalTasks} công việc đã hoàn thành.
          </p>
        </div>
      </section>

      {/* Khu vực Cảnh báo công việc cần chú ý */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-red-50/50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 animate-bounce" />
            <h2 className="font-bold text-gray-900 text-base">Công Việc Cần Chú Ý Cấp Bách</h2>
          </div>
          <Link
            href="/tasks"
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {warningAttentionTasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            🎉 Tuyệt vời! Hiện không có công việc nào bị quá hạn hoặc sắp đến hạn trong 24 giờ tới.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {warningAttentionTasks.map((t) => {
              const isOverdue = new Date(t.deadline) < now;
              return (
                <div key={t.id} className="p-4 hover:bg-gray-50 flex items-center justify-between gap-4 transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {t.code}
                      </span>
                      <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{t.title}</h4>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Lĩnh vực: <strong>{t.field}</strong></span>
                      <span>&bull;</span>
                      <span>Người làm: <strong>{t.assignee.fullName}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          isOverdue ? "bg-red-100 text-red-800 animate-pulse" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {isOverdue ? "QUÁ HẠN" : "SẮP ĐẾN HẠN"}
                      </span>
                      <p className="text-[11px] text-gray-500 mt-1 font-medium">{formatDate(t.deadline)}</p>
                    </div>

                    <Link
                      href={`/tasks?id=${t.id}`}
                      className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition"
                    >
                      Xử lý
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
