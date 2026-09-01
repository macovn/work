"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart2,
  RefreshCw,
  Download,
  Calendar,
  CheckCircle2,
  FolderOpen,
  Clock,
  AlertTriangle,
  PieChart,
  ShieldCheck,
  Check,
  PauseCircle,
  HelpCircle,
  Search,
  Filter,
  Users,
  Award,
  TrendingUp,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { calculateEvaluation, EvaluationResult } from "@/lib/evaluation";

interface TaskItem {
  id: string;
  code: string;
  title: string;
  field: string;
  assigneeId: string;
  assignee: { id: string; fullName: string; email: string };
  deadline: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "TODO" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  result?: string | null;
  notes?: string | null;
  updatedAt: string;
  kpiScore?: number | null;
  assignedScore?: number | null;
  completedScore?: number | null;
  completionRate?: number | null;
}

interface UserItem {
  id: string;
  fullName: string;
  email: string;
}

export default function ReportsPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>("");

  // Filters state
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [kpiMonthFilter, setKpiMonthFilter] = useState("");
  const [onlyOverdueFilter, setOnlyOverdueFilter] = useState(false);

  // Table search
  const [employeeSearch, setEmployeeSearch] = useState("");

  const updateTimestamp = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("vi-VN");
    const dateStr = now.toLocaleDateString("vi-VN");
    setLastUpdatedTime(`${timeStr} ${dateStr}`);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        fetch("/api/tasks?limit=1000"),
        fetch("/api/users"),
      ]);
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks || []);
      }
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData.users || []);
      }
      updateTimestamp();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique fields
  const availableFields = useMemo(() => {
    const fieldsSet = new Set<string>();
    tasks.forEach((t) => {
      if (t.field) fieldsSet.add(t.field);
    });
    return Array.from(fieldsSet);
  }, [tasks]);

  // Filter tasks based on the 8 filter inputs
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return tasks.filter((t) => {
      if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
      if (fieldFilter && t.field !== fieldFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;

      if (onlyOverdueFilter) {
        const isOverdue =
          t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < startOfToday;
        if (!isOverdue) return false;
      }

      if (fromDateFilter) {
        if (new Date(t.deadline) < new Date(fromDateFilter)) return false;
      }
      if (toDateFilter) {
        const toEnd = new Date(toDateFilter);
        toEnd.setHours(23, 59, 59, 999);
        if (new Date(t.deadline) > toEnd) return false;
      }

      if (kpiMonthFilter) {
        const [yr, mo] = kpiMonthFilter.split("-");
        const d = new Date(t.deadline);
        if (d.getFullYear() !== parseInt(yr) || d.getMonth() + 1 !== parseInt(mo)) return false;
      }

      if (keywordFilter.trim()) {
        const q = keywordFilter.toLowerCase().trim();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchCode = t.code.toLowerCase().includes(q);
        const matchAssignee = t.assignee.fullName.toLowerCase().includes(q);
        const matchNotes = (t.notes || "").toLowerCase().includes(q);
        if (!matchTitle && !matchCode && !matchAssignee && !matchNotes) return false;
      }

      return true;
    });
  }, [
    tasks,
    assigneeFilter,
    fieldFilter,
    statusFilter,
    priorityFilter,
    fromDateFilter,
    toDateFilter,
    keywordFilter,
    kpiMonthFilter,
    onlyOverdueFilter,
  ]);

  // Calculate 12 Metrics
  const metrics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const endOf3Days = new Date(startOfToday.getTime() + 4 * 24 * 60 * 60 * 1000 - 1);

    const total = filteredTasks.length;
    let completed = 0;
    let open = 0; // TODO + IN_PROGRESS + PAUSED
    let overdue = 0;
    let next3Days = 0;
    let completedOnTime = 0;
    let completedLate = 0;
    let paused = 0;
    let noResult = 0;
    let dueToday = 0;

    let todoCount = 0;
    let inProgressCount = 0;

    let highPriorityCount = 0;
    let mediumPriorityCount = 0;
    let lowPriorityCount = 0;

    filteredTasks.forEach((t) => {
      const d = new Date(t.deadline);
      const isOverdue = t.status !== "COMPLETED" && t.status !== "CANCELLED" && d < startOfToday;

      if (t.status === "COMPLETED") {
        completed++;
        const updatedD = new Date(t.updatedAt);
        if (updatedD <= d) {
          completedOnTime++;
        } else {
          completedLate++;
        }
      } else if (t.status !== "CANCELLED") {
        open++;
        if (t.status === "TODO") todoCount++;
        if (t.status === "IN_PROGRESS") inProgressCount++;
        if (t.status === "PAUSED") paused++;
      }

      if (isOverdue) overdue++;

      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && d > endOfToday && d <= endOf3Days) {
        next3Days++;
      }

      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && d >= startOfToday && d <= endOfToday) {
        dueToday++;
      }

      if (!t.result || !t.result.trim()) {
        noResult++;
      }

      if (t.priority === "HIGH") highPriorityCount++;
      if (t.priority === "MEDIUM") mediumPriorityCount++;
      if (t.priority === "LOW") lowPriorityCount++;
    });

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = completed > 0 ? Math.round((completedOnTime / completed) * 100) : 0;

    return {
      total,
      completed,
      open,
      overdue,
      next3Days,
      completionRate,
      completedOnTime,
      completedLate,
      onTimeRate,
      paused,
      noResult,
      dueToday,
      todoCount,
      inProgressCount,
      highPriorityCount,
      mediumPriorityCount,
      lowPriorityCount,
    };
  }, [filteredTasks]);

  // Overall Evaluation (Work Order Spec)
  const overallEvaluation: EvaluationResult = useMemo(() => {
    return calculateEvaluation(
      filteredTasks.map((t) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        assignedScore: t.assignedScore,
        completedScore: t.completedScore,
        kpiScore: t.kpiScore,
        status: t.status,
      }))
    );
  }, [filteredTasks]);

  // Employee Aggregation Report
  const employeeReport = useMemo(() => {
    const map: Record<
      string,
      {
        user: UserItem;
        total: number;
        completed: number;
        inProgress: number;
        overdue: number;
        completedOnTime: number;
        tasks: TaskItem[];
      }
    > = {};

    users.forEach((u) => {
      map[u.id] = {
        user: u,
        total: 0,
        completed: 0,
        inProgress: 0,
        overdue: 0,
        completedOnTime: 0,
        tasks: [],
      };
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    filteredTasks.forEach((t) => {
      if (!map[t.assigneeId]) {
        map[t.assigneeId] = {
          user: t.assignee,
          total: 0,
          completed: 0,
          inProgress: 0,
          overdue: 0,
          completedOnTime: 0,
          tasks: [],
        };
      }

      const emp = map[t.assigneeId];
      emp.total++;
      emp.tasks.push(t);

      if (t.status === "COMPLETED") {
        emp.completed++;
        if (new Date(t.updatedAt) <= new Date(t.deadline)) {
          emp.completedOnTime++;
        }
      } else if (t.status === "IN_PROGRESS") {
        emp.inProgress++;
      }

      if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < startOfToday) {
        emp.overdue++;
      }
    });

    return Object.values(map)
      .map((emp) => {
        const completionRate = emp.total > 0 ? Math.round((emp.completed / emp.total) * 100) : 0;
        const onTimeRate = emp.completed > 0 ? Math.round((emp.completedOnTime / emp.completed) * 100) : 0;
        const evaluation = calculateEvaluation(
          emp.tasks.map((t) => ({
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
          ...emp,
          completionRate,
          onTimeRate,
          evaluation,
        };
      })
      .filter((emp) => {
        if (!employeeSearch.trim()) return true;
        const q = employeeSearch.toLowerCase().trim();
        return (
          emp.user.fullName.toLowerCase().includes(q) || emp.user.email.toLowerCase().includes(q)
        );
      });
  }, [filteredTasks, users, employeeSearch]);

  // Donut 1 Percentages (Status)
  const statusPercents = useMemo(() => {
    const tot = metrics.total || 1;
    return {
      completed: Math.round((metrics.completed / tot) * 100),
      inProgress: Math.round((metrics.inProgressCount / tot) * 100),
      overdue: Math.round((metrics.overdue / tot) * 100),
      paused: Math.round((metrics.paused / tot) * 100),
      todo: Math.round((metrics.todoCount / tot) * 100),
    };
  }, [metrics]);

  // Donut 2 Percentages (Priority)
  const priorityPercents = useMemo(() => {
    const tot = metrics.total || 1;
    return {
      high: Math.round((metrics.highPriorityCount / tot) * 100),
      medium: Math.round((metrics.mediumPriorityCount / tot) * 100),
      low: Math.round((metrics.lowPriorityCount / tot) * 100),
    };
  }, [metrics]);

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-2xs">
            <BarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Phân tích tiến độ công việc</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Cập nhật lúc {lastUpdatedTime || "22:11:57 23/8/2026"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> CẬP NHẬT
          </button>

          <a
            href="/api/reports/export"
            download="Bao_Cao_Quan_Ly_Cong_Viec.xlsx"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> XUẤT EXCEL
          </a>
        </div>
      </div>

      {/* ADVANCED FILTER PANEL */}
      <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          <div>
            <label className="block font-bold text-gray-500 mb-1">Nhân viên</label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Lĩnh vực</label>
            <select
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả</option>
              {availableFields.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Trạng thái</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả</option>
              <option value="TODO">Chưa thực hiện</option>
              <option value="IN_PROGRESS">Đang thực hiện</option>
              <option value="PAUSED">Tạm dừng</option>
              <option value="COMPLETED">Hoàn thành</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Ưu tiên</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả</option>
              <option value="HIGH">Rất gấp</option>
              <option value="MEDIUM">Gấp</option>
              <option value="LOW">Bình thường</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Từ hạn</label>
            <input
              type="date"
              value={fromDateFilter}
              onChange={(e) => setFromDateFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Đến hạn</label>
            <input
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Từ khóa</label>
            <input
              type="text"
              placeholder="Tên việc, nhân viên..."
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-bold text-gray-500 mb-1">Tháng KPI</label>
            <input
              type="month"
              value={kpiMonthFilter}
              onChange={(e) => setKpiMonthFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={onlyOverdueFilter}
              onChange={(e) => setOnlyOverdueFilter(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
            />
            Chỉ việc quá hạn
          </label>

          {(assigneeFilter ||
            fieldFilter ||
            statusFilter ||
            priorityFilter ||
            fromDateFilter ||
            toDateFilter ||
            keywordFilter ||
            kpiMonthFilter ||
            onlyOverdueFilter) && (
            <button
              onClick={() => {
                setAssigneeFilter("");
                setFieldFilter("");
                setStatusFilter("");
                setPriorityFilter("");
                setFromDateFilter("");
                setToDateFilter("");
                setKeywordFilter("");
                setKpiMonthFilter("");
                setOnlyOverdueFilter(false);
              }}
              className="text-xs text-red-600 hover:underline font-bold"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* KẾT QUẢ ĐÁNH GIÁ – XẾP LOẠI (WORK ORDER SPEC) */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shadow-2xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 tracking-tight">
                KẾT QUẢ ĐÁNH GIÁ – XẾP LOẠI
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Áp dụng công thức: Tổng điểm = Điểm TB theo trọng số × KPI trung bình (%)
              </p>
            </div>
          </div>
          {overallEvaluation.hasEnoughData && (
            <span className="text-xs font-bold text-gray-600 bg-gray-50 px-3.5 py-1.5 rounded-xl border border-gray-200">
              Tổng hợp: {overallEvaluation.validScoreCount} điểm nhiệm vụ &bull; {overallEvaluation.validKpiCount} KPI hợp lệ
            </span>
          )}
        </div>

        {overallEvaluation.hasEnoughData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {/* 1. Điểm TB theo trọng số */}
            <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Điểm TB theo trọng số
              </span>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-gray-900">
                  {overallEvaluation.weightedAverageScore?.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-gray-400">điểm</span>
              </div>
              <p className="text-[10px] text-gray-400 font-medium">
                Trung bình cộng các điểm đã phản ánh trọng số
              </p>
            </div>

            {/* 2. KPI trung bình */}
            <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200/60 flex flex-col justify-between">
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                KPI Trung Bình
              </span>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-purple-700">
                  {overallEvaluation.averageKpi?.toFixed(2)}%
                </span>
              </div>
              <p className="text-[10px] text-purple-500 font-medium">
                Tổng KPI % / số nhiệm vụ có KPI hợp lệ
              </p>
            </div>

            {/* 3. TỔNG ĐIỂM */}
            <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 flex flex-col justify-between">
              <span className="text-[11px] font-black text-blue-700 uppercase tracking-wider">
                TỔNG ĐIỂM
              </span>
              <div className="my-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-blue-700">
                  {overallEvaluation.totalScore?.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-blue-500">điểm</span>
              </div>
              <p className="text-[10px] text-blue-500 font-medium font-mono">
                {overallEvaluation.weightedAverageScore?.toFixed(2)} × {overallEvaluation.averageKpi?.toFixed(2)}%
              </p>
            </div>

            {/* 4. XẾP LOẠI */}
            <div className={`p-4 rounded-2xl border flex flex-col justify-between ${overallEvaluation.rating.bgColor} ${overallEvaluation.rating.borderColor}`}>
              <span className={`text-[11px] font-black uppercase tracking-wider ${overallEvaluation.rating.textColor}`}>
                XẾP LOẠI
              </span>
              <div className="my-2">
                <span className={`inline-block px-3 py-1.5 rounded-xl font-black text-xs shadow-xs ${overallEvaluation.rating.badgeColor}`}>
                  {overallEvaluation.rating.label}
                </span>
              </div>
              <p className={`text-[10px] font-bold ${overallEvaluation.rating.textColor}`}>
                {overallEvaluation.totalScore! >= 90
                  ? "≥ 90.00 điểm (Xuất sắc)"
                  : overallEvaluation.totalScore! >= 70
                  ? "70.00 – 89.99 điểm (Tốt)"
                  : overallEvaluation.totalScore! >= 50
                  ? "50.00 – 69.99 điểm (Hoàn thành)"
                  : "< 50.00 điểm (Không hoàn thành)"}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-amber-50/60 border border-amber-200 rounded-2xl text-center space-y-1">
            <p className="text-sm font-bold text-amber-800">
              ⚠️ Chưa đủ dữ liệu để đánh giá
            </p>
            <p className="text-xs text-amber-600">
              Cần có ít nhất một nhiệm vụ hoàn thành và được chấm điểm KPI để tính toán Đánh giá & Xếp loại.
            </p>
          </div>
        )}
      </div>

      {/* 12 METRICS CARDS SECTION (2x6 Balanced Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
        {/* Card 1: Tổng công việc */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Tổng công việc</p>
            <span className="text-2xl font-black text-blue-600">{metrics.total}</span>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Đã hoàn thành */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Đã hoàn thành</p>
            <span className="text-2xl font-black text-emerald-600">{metrics.completed}</span>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Đang mở */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Đang mở</p>
            <span className="text-2xl font-black text-blue-500">{metrics.open}</span>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-500 rounded-xl shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Quá hạn */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Quá hạn</p>
            <span className="text-2xl font-black text-red-600">{metrics.overdue}</span>
          </div>
          <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 5: Sắp hạn 3 ngày */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Sắp hạn 3 ngày</p>
            <span className="text-2xl font-black text-amber-600">{metrics.next3Days}</span>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Card 6: Tỷ lệ hoàn thành */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Tỷ lệ hoàn thành</p>
            <span className="text-2xl font-black text-purple-600">{metrics.completionRate}%</span>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <PieChart className="w-5 h-5" />
          </div>
        </div>

        {/* Card 7: Hoàn thành đúng hạn */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Hoàn thành đúng hạn</p>
            <span className="text-2xl font-black text-emerald-600">{metrics.completedOnTime}</span>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Card 8: Hoàn thành trễ hạn */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Hoàn thành trễ hạn</p>
            <span className="text-2xl font-black text-red-500">{metrics.completedLate}</span>
          </div>
          <div className="p-2.5 bg-red-50 text-red-500 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 9: Tỷ lệ đúng hạn */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Tỷ lệ đúng hạn</p>
            <span className="text-2xl font-black text-indigo-600">{metrics.onTimeRate}%</span>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
        </div>

        {/* Card 10: Tạm dừng */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Tạm dừng</p>
            <span className="text-2xl font-black text-amber-600">{metrics.paused}</span>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <PauseCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Card 11: Chưa có kết quả */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Chưa có kết quả</p>
            <span className="text-2xl font-black text-gray-700">{metrics.noResult}</span>
          </div>
          <div className="p-2.5 bg-gray-100 text-gray-600 rounded-xl shrink-0">
            <HelpCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Card 12: Đến hạn hôm nay */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-400">Đến hạn hôm nay</p>
            <span className="text-2xl font-black text-purple-600">{metrics.dueToday}</span>
          </div>
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3 VISUALIZATION CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART 1: Theo trạng thái */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Theo trạng thái</h3>
          <div className="flex flex-col items-center justify-center p-4 bg-gray-50/60 rounded-2xl border border-gray-100 space-y-4">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="46" fill="none" stroke="#f3f4f6" strokeWidth="12" />
                {/* Completed (Blue) */}
                {statusPercents.completed > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="12"
                    strokeDasharray={`${statusPercents.completed * 2.89} 289`}
                    strokeDashoffset="0"
                  />
                )}
                {/* In Progress (Cyan) */}
                {statusPercents.inProgress > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="12"
                    strokeDasharray={`${statusPercents.inProgress * 2.89} 289`}
                    strokeDashoffset={`-${statusPercents.completed * 2.89}`}
                  />
                )}
                {/* Overdue (Red) */}
                {statusPercents.overdue > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="12"
                    strokeDasharray={`${statusPercents.overdue * 2.89} 289`}
                    strokeDashoffset={`-${(statusPercents.completed + statusPercents.inProgress) * 2.89}`}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-gray-900">{metrics.total}</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase">Tổng công việc</span>
              </div>
            </div>

            <div className="w-full space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Đã hoàn thành
                </span>
                <span className="font-bold">{metrics.completed} ({statusPercents.completed}%)</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-600" /> Đang thực hiện
                </span>
                <span className="font-bold">{metrics.inProgressCount} ({statusPercents.inProgress}%)</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Quá hạn
                </span>
                <span className="font-bold">{metrics.overdue} ({statusPercents.overdue}%)</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Tạm dừng
                </span>
                <span className="font-bold">{metrics.paused} ({statusPercents.paused}%)</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Chưa thực hiện
                </span>
                <span className="font-bold">{metrics.todoCount} ({statusPercents.todo}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHART 2: Theo mức độ ưu tiên */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Theo mức độ ưu tiên</h3>
          <div className="flex flex-col items-center justify-center p-4 bg-gray-50/60 rounded-2xl border border-gray-100 space-y-4">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="46" fill="none" stroke="#f3f4f6" strokeWidth="12" />
                {/* High (Red) */}
                {priorityPercents.high > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="12"
                    strokeDasharray={`${priorityPercents.high * 2.89} 289`}
                    strokeDashoffset="0"
                  />
                )}
                {/* Medium (Amber) */}
                {priorityPercents.medium > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="12"
                    strokeDasharray={`${priorityPercents.medium * 2.89} 289`}
                    strokeDashoffset={`-${priorityPercents.high * 2.89}`}
                  />
                )}
                {/* Low (Blue) */}
                {priorityPercents.low > 0 && (
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="12"
                    strokeDasharray={`${priorityPercents.low * 2.89} 289`}
                    strokeDashoffset={`-${(priorityPercents.high + priorityPercents.medium) * 2.89}`}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-gray-900">{metrics.total}</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase">Tổng công việc</span>
              </div>
            </div>

            <div className="w-full space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rất gấp
                </span>
                <span className="font-bold">{metrics.highPriorityCount} ({priorityPercents.high}%)</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Gấp
                </span>
                <span className="font-bold">{metrics.mediumPriorityCount} ({priorityPercents.medium}%)</span>
              </div>
              <div className="flex items-center justify-between text-gray-700">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Bình thường
                </span>
                <span className="font-bold">{metrics.lowPriorityCount} ({priorityPercents.low}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* CHART 3: Tỷ lệ hoàn thành (Semi-circle Arc Gauge) */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Tỷ lệ hoàn thành</h3>
          <div className="flex flex-col items-center justify-center p-4 bg-gray-50/60 rounded-2xl border border-gray-100 space-y-4 h-[252px]">
            <div className="relative w-44 h-24 mt-4">
              <svg className="w-full h-full" viewBox="0 0 120 65">
                {/* Background Arc */}
                <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" />
                {/* Progress Arc */}
                {metrics.completionRate > 0 && (
                  <path
                    d="M 10 60 A 50 50 0 0 1 110 60"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${(metrics.completionRate / 100) * 157} 157`}
                  />
                )}
              </svg>
              <div className="absolute inset-x-0 bottom-0 text-center">
                <span className="text-3xl font-black text-blue-600">{metrics.completionRate}%</span>
                <p className="text-[11px] font-bold text-gray-500 mt-0.5">Đã hoàn thành</p>
              </div>
            </div>

            <div className="text-center pt-2">
              <span className="text-xs font-bold text-gray-600 bg-white px-3 py-1 rounded-full border border-gray-200">
                {metrics.completed} / {metrics.total} công việc
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM TABLE SECTION: Báo cáo theo nhân viên */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xs overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-gray-900 text-base">Báo cáo theo nhân viên</h3>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Tìm kiếm nhân viên..."
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 text-gray-600 font-bold border-y border-gray-100">
                <th className="p-3">Nhân sự</th>
                <th className="p-3 text-center">Tổng CV</th>
                <th className="p-3 text-center">Hoàn thành</th>
                <th className="p-3 text-center">Điểm TB (theo TS)</th>
                <th className="p-3 text-center">KPI TB</th>
                <th className="p-3 text-center">TỔNG ĐIỂM</th>
                <th className="p-3 text-center">XẾP LOẠI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employeeReport.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500">
                    Không tìm thấy nhân viên nào phù hợp
                  </td>
                </tr>
              ) : (
                employeeReport.map((emp) => (
                  <tr key={emp.user.id} className="hover:bg-gray-50/60 transition">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                          {emp.user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{emp.user.fullName}</p>
                          <p className="text-[11px] text-gray-400 font-mono">{emp.user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-center font-bold text-gray-900">{emp.total}</td>

                    <td className="p-3 text-center">
                      <span className="font-bold text-emerald-600">{emp.completed}</span>
                      <span className="text-[10px] text-gray-400 block font-semibold">({emp.completionRate}%)</span>
                    </td>

                    <td className="p-3 text-center font-bold text-gray-800">
                      {emp.evaluation.weightedAverageScore !== null
                        ? emp.evaluation.weightedAverageScore.toFixed(2)
                        : "—"}
                    </td>

                    <td className="p-3 text-center font-bold text-purple-600">
                      {emp.evaluation.averageKpi !== null
                        ? `${emp.evaluation.averageKpi.toFixed(2)}%`
                        : "Chưa chấm"}
                    </td>

                    <td className="p-3 text-center font-black text-blue-700 text-sm">
                      {emp.evaluation.totalScore !== null
                        ? emp.evaluation.totalScore.toFixed(2)
                        : "—"}
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg font-bold text-[10px] whitespace-nowrap shadow-2xs ${emp.evaluation.rating.badgeColor}`}
                      >
                        {emp.evaluation.rating.label}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
