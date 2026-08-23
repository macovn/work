"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  X,
  Clock,
  Calendar,
  Hourglass,
  CheckCircle2,
  Search,
  Filter,
  Eye,
  Edit,
  Check,
  AlertTriangle,
  Award,
  ChevronRight,
} from "lucide-react";
import { formatDate, formatPriority, formatStatus } from "@/lib/utils";

interface WorkSummaryTask {
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
  group: "OVERDUE" | "TODAY" | "NEXT_3_DAYS" | "OTHER" | "COMPLETED";
  isOverdue: boolean;
  daysOverdue: number;
  daysRemaining: number;
  timeBadgeText: string;
  kpiQuantity?: number | null;
  kpiProgress?: number | null;
  kpiQuality?: number | null;
  kpiScore?: number | null;
  kpiEvaluator?: { id: string; fullName: string; email: string } | null;
  kpiEvaluatedAt?: string | null;
  kpiComment?: string | null;
}

interface SummaryData {
  summary: {
    overdue: number;
    today: number;
    next3Days: number;
    completedToday: number;
    total: number;
  };
  chartStats: {
    total: number;
    overdueCount: number;
    overduePercent: number;
    todayCount: number;
    todayPercent: number;
    next3DaysCount: number;
    next3DaysPercent: number;
    otherCount: number;
    otherPercent: number;
  };
  suggestions: Array<{
    id: string;
    type: string;
    count: number;
    title: string;
    subtitle: string;
  }>;
  tasks: WorkSummaryTask[];
}

interface WorkSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkSummaryModal({ isOpen, onClose }: WorkSummaryModalProps) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters state inside modal
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [activeGroupFilter, setActiveGroupFilter] = useState<string | null>(null);

  // Sub-modal states
  const [viewingTask, setViewingTask] = useState<WorkSummaryTask | null>(null);
  const [updatingTask, setUpdatingTask] = useState<WorkSummaryTask | null>(null);
  const [updateFormData, setUpdateFormData] = useState({
    status: "COMPLETED",
    result: "",
    notes: "",
  });
  const [submittingUpdate, setSubmittingUpdate] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tasks/work-summary");
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Không thể tải dữ liệu tổng hợp công việc");
      }
      const summaryData: SummaryData = await res.json();
      setData(summaryData);
    } catch (err: any) {
      console.error("[WorkSummaryModal Fetch Error]:", err);
      setError(err.message || "Lỗi khi kết nối hệ thống");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSummary();
    }
  }, [isOpen, fetchSummary]);

  if (!isOpen) return null;

  const assignees = Array.from(
    new Map((data?.tasks || []).map((t) => [t.assignee.id, t.assignee])).values()
  );

  // Filter tasks based on search, status, priority, assignee, and active group filter
  const filteredTasks = (data?.tasks || []).filter((t) => {
    if (activeGroupFilter && t.group !== activeGroupFilter) return false;
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
    if (assigneeFilter !== "ALL" && t.assigneeId !== assigneeFilter) return false;
    if (search.trim()) {
      const query = search.toLowerCase().trim();
      const matchCode = t.code.toLowerCase().includes(query);
      const matchTitle = t.title.toLowerCase().includes(query);
      const matchField = t.field.toLowerCase().includes(query);
      if (!matchCode && !matchTitle && !matchField) return false;
    }
    return true;
  });

  const handleQuickComplete = async (task: WorkSummaryTask) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          result: task.result || "Đã hoàn thành qua Bảng tổng hợp công việc",
        }),
      });
      if (res.ok) {
        fetchSummary();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingTask) return;
    setSubmittingUpdate(true);
    try {
      const res = await fetch(`/api/tasks/${updatingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateFormData),
      });
      if (res.ok) {
        setUpdatingTask(null);
        fetchSummary();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const summary = data?.summary || { overdue: 0, today: 0, next3Days: 0, completedToday: 0, total: 0 };
  const chartStats = data?.chartStats || {
    total: 0,
    overdueCount: 0,
    overduePercent: 0,
    todayCount: 0,
    todayPercent: 0,
    next3DaysCount: 0,
    next3DaysPercent: 0,
    otherCount: 0,
    otherPercent: 0,
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-6xl w-full p-5 sm:p-7 space-y-6 shadow-2xl relative my-auto max-h-[92vh] flex flex-col">
        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600 shadow-sm">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Công việc sắp đến hạn</h2>
              <p className="text-xs text-gray-500 font-medium">Theo dõi các công việc cần xử lý sớm để tránh quá hạn</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer"
          >
            <X className="w-4 h-4" /> Đóng
          </button>
        </div>

        {loading && !data ? (
          <div className="p-12 text-center text-sm font-semibold text-gray-500">
            Đang tải dữ liệu công việc cần quan tâm...
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 text-red-700 rounded-2xl text-sm font-semibold border border-red-200">
            {error}
          </div>
        ) : (
          <div className="overflow-y-auto space-y-6 pr-1 custom-scrollbar">
            {/* 4 SUMMARY CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Quá hạn */}
              <div
                onClick={() => setActiveGroupFilter(activeGroupFilter === "OVERDUE" ? null : "OVERDUE")}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  activeGroupFilter === "OVERDUE"
                    ? "bg-red-100/90 border-red-300 ring-2 ring-red-400"
                    : "bg-red-50/50 border-red-100 hover:bg-red-50 shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-red-100 rounded-xl text-red-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-md">
                    Cần xử lý ngay
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black text-red-700">{summary.overdue}</span>
                  <p className="text-xs font-bold text-red-900 mt-0.5">Quá hạn</p>
                </div>
              </div>

              {/* Card 2: Hôm nay */}
              <div
                onClick={() => setActiveGroupFilter(activeGroupFilter === "TODAY" ? null : "TODAY")}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  activeGroupFilter === "TODAY"
                    ? "bg-blue-100/90 border-blue-300 ring-2 ring-blue-400"
                    : "bg-blue-50/50 border-blue-100 hover:bg-blue-50 shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-md">
                    Hạn trong ngày
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black text-blue-700">{summary.today}</span>
                  <p className="text-xs font-bold text-blue-900 mt-0.5">Hôm nay</p>
                </div>
              </div>

              {/* Card 3: 3 ngày tới */}
              <div
                onClick={() => setActiveGroupFilter(activeGroupFilter === "NEXT_3_DAYS" ? null : "NEXT_3_DAYS")}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  activeGroupFilter === "NEXT_3_DAYS"
                    ? "bg-amber-100/90 border-amber-300 ring-2 ring-amber-400"
                    : "bg-amber-50/50 border-amber-100 hover:bg-amber-50 shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600">
                    <Hourglass className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100/80 px-2 py-0.5 rounded-md">
                    Sắp đến hạn
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black text-amber-700">{summary.next3Days}</span>
                  <p className="text-xs font-bold text-amber-900 mt-0.5">3 ngày tới</p>
                </div>
              </div>

              {/* Card 4: Đã hoàn thành hôm nay */}
              <div
                onClick={() => setActiveGroupFilter(activeGroupFilter === "COMPLETED" ? null : "COMPLETED")}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  activeGroupFilter === "COMPLETED"
                    ? "bg-emerald-100/90 border-emerald-300 ring-2 ring-emerald-400"
                    : "bg-emerald-50/50 border-emerald-100 hover:bg-emerald-50 shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    Tuyệt vời
                  </span>
                </div>
                <div className="mt-3">
                  <span className="text-3xl font-black text-emerald-700">{summary.completedToday}</span>
                  <p className="text-xs font-bold text-emerald-900 mt-0.5">Đã hoàn thành hôm nay</p>
                </div>
              </div>
            </div>

            {/* MAIN TWO-COLUMN SECTION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LEFT COLUMN: TASK LIST & FILTERS */}
              <div className="lg:col-span-2 space-y-4">
                {/* Internal Search & Filter Bar */}
                <div className="bg-gray-50/80 p-3 rounded-2xl border border-gray-200/80 space-y-2 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    <div className="relative sm:col-span-1">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        placeholder="Tìm kiếm công việc..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ALL">Trạng thái: Tất cả</option>
                      <option value="TODO">Chưa thực hiện</option>
                      <option value="IN_PROGRESS">Đang thực hiện</option>
                      <option value="PAUSED">Tạm dừng</option>
                      <option value="COMPLETED">Hoàn thành</option>
                    </select>

                    <select
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ALL">Người phụ trách: Tất cả</option>
                      {assignees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>

                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ALL">Ưu tiên: Tất cả</option>
                      <option value="HIGH">Rất gấp</option>
                      <option value="MEDIUM">Gấp</option>
                      <option value="LOW">Bình thường</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setSearch("");
                          setStatusFilter("ALL");
                          setPriorityFilter("ALL");
                          setAssigneeFilter("ALL");
                          setActiveGroupFilter(null);
                        }}
                        className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs w-full flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Filter className="w-3.5 h-3.5" /> Lọc
                      </button>
                    </div>
                  </div>

                  {activeGroupFilter && (
                    <div className="flex items-center justify-between pt-1 border-t border-gray-200/60 text-[11px]">
                      <span className="text-gray-600 font-semibold">
                        Đang lọc theo nhóm:{" "}
                        <strong className="text-blue-700 uppercase">
                          {activeGroupFilter === "OVERDUE"
                            ? "Quá hạn"
                            : activeGroupFilter === "TODAY"
                            ? "Hôm nay"
                            : activeGroupFilter === "NEXT_3_DAYS"
                            ? "3 ngày tới"
                            : "Hoàn thành hôm nay"}
                        </strong>
                      </span>
                      <button
                        onClick={() => setActiveGroupFilter(null)}
                        className="text-red-600 hover:underline font-bold"
                      >
                        Xóa lọc nhóm
                      </button>
                    </div>
                  )}
                </div>

                {/* Task Items List */}
                {filteredTasks.length === 0 ? (
                  <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs text-gray-500">
                    🎉 Không tìm thấy công việc nào phù hợp trong danh sách cần quan tâm.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTasks.map((t) => (
                      <div
                        key={t.id}
                        className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-xs hover:shadow-md transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-red-500"
                      >
                        <div className="space-y-1.5 max-w-lg">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                            <h4 className="font-bold text-gray-900 text-sm leading-snug">{t.title}</h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                            <span>
                              👤 Người phụ trách: <strong className="text-gray-800">{t.assignee.fullName}</strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              📅 Hạn: <strong className="text-red-600">{formatDate(t.deadline)}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span>📁 Danh mục: <strong className="text-gray-600">{t.field}</strong></span>
                            <span>&bull;</span>
                            <span className="font-semibold text-gray-500">
                              Mức độ: {formatPriority(t.priority)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => setViewingTask(t)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] rounded-lg border border-blue-200 transition"
                            >
                              Xem chi tiết
                            </button>
                            <button
                              onClick={() => {
                                setUpdatingTask(t);
                                setUpdateFormData({
                                  status: t.status,
                                  result: t.result || "",
                                  notes: t.notes || "",
                                });
                              }}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-xs transition"
                            >
                              Cập nhật
                            </button>
                            {t.status !== "COMPLETED" && (
                              <button
                                onClick={() => handleQuickComplete(t)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-lg border border-emerald-200 transition flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Đánh dấu xong
                              </button>
                            )}
                          </div>

                          <span
                            className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-block ${
                              t.group === "OVERDUE"
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : t.group === "TODAY"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : t.group === "NEXT_3_DAYS"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {t.timeBadgeText}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: DONUT CHART & QUICK SUGGESTIONS */}
              <div className="space-y-4">
                {/* Quick Suggestions & Donut Chart Box */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-xs space-y-5">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Gợi ý xử lý nhanh</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Thống kê nhắc việc</p>
                  </div>

                  {/* SVG Donut Chart */}
                  <div className="flex flex-col items-center justify-center p-3 bg-gray-50/70 rounded-2xl border border-gray-100 space-y-3">
                    <div className="relative w-36 h-36">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                        {/* Background Ring */}
                        <circle cx="60" cy="60" r="46" fill="none" stroke="#f3f4f6" strokeWidth="12" />

                        {/* Overdue Arc (Red) */}
                        {chartStats.overduePercent > 0 && (
                          <circle
                            cx="60"
                            cy="60"
                            r="46"
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="12"
                            strokeDasharray={`${chartStats.overduePercent * 2.89} 289`}
                            strokeDashoffset="0"
                          />
                        )}

                        {/* Today Arc (Blue) */}
                        {chartStats.todayPercent > 0 && (
                          <circle
                            cx="60"
                            cy="60"
                            r="46"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="12"
                            strokeDasharray={`${chartStats.todayPercent * 2.89} 289`}
                            strokeDashoffset={`-${chartStats.overduePercent * 2.89}`}
                          />
                        )}

                        {/* Next 3 Days Arc (Amber) */}
                        {chartStats.next3DaysPercent > 0 && (
                          <circle
                            cx="60"
                            cy="60"
                            r="46"
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="12"
                            strokeDasharray={`${chartStats.next3DaysPercent * 2.89} 289`}
                            strokeDashoffset={`-${(chartStats.overduePercent + chartStats.todayPercent) * 2.89}`}
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-black text-gray-900">{chartStats.total}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Tổng việc</span>
                      </div>
                    </div>

                    {/* Chart Legend */}
                    <div className="w-full space-y-1 text-xs">
                      <div className="flex items-center justify-between text-gray-700 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Quá hạn
                        </span>
                        <span className="font-bold text-gray-900">
                          {chartStats.overdueCount} ({chartStats.overduePercent}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-gray-700 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Hôm nay
                        </span>
                        <span className="font-bold text-gray-900">
                          {chartStats.todayCount} ({chartStats.todayPercent}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-gray-700 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> 3 ngày tới
                        </span>
                        <span className="font-bold text-gray-900">
                          {chartStats.next3DaysCount} ({chartStats.next3DaysPercent}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-gray-700 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Khác
                        </span>
                        <span className="font-bold text-gray-900">
                          {chartStats.otherCount} ({chartStats.otherPercent}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3 Action Suggestion Cards */}
                  <div className="space-y-2.5 text-xs">
                    {data?.suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        onClick={() => {
                          if (sug.type === "TODAY") setActiveGroupFilter("TODAY");
                          if (sug.type === "OVERDUE") setActiveGroupFilter("OVERDUE");
                          if (sug.type === "NEXT_3_DAYS") setActiveGroupFilter("NEXT_3_DAYS");
                        }}
                        className="p-3 bg-red-50/50 hover:bg-red-50 border border-red-100 rounded-xl transition cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <h5 className="font-bold text-red-900 text-xs">{sug.title}</h5>
                          <p className="text-[11px] text-gray-500">{sug.subtitle}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* NESTED MODAL: VIEW DETAILS */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setViewingTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="space-y-1">
              <span className="font-mono text-xs font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                {viewingTask.code}
              </span>
              <h3 className="text-xl font-bold text-gray-900">{viewingTask.title}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs border-y border-gray-100 py-3">
              <div>
                <p className="text-gray-400 font-semibold">Lĩnh vực:</p>
                <p className="font-bold text-gray-800">{viewingTask.field}</p>
              </div>
              <div>
                <p className="text-gray-400 font-semibold">Người thực hiện:</p>
                <p className="font-bold text-gray-800">{viewingTask.assignee.fullName}</p>
              </div>
              <div>
                <p className="text-gray-400 font-semibold">Mức độ ưu tiên:</p>
                <p className="font-bold text-gray-800">{formatPriority(viewingTask.priority)}</p>
              </div>
              <div>
                <p className="text-gray-400 font-semibold">Trạng thái:</p>
                <p className="font-bold text-gray-800">{formatStatus(viewingTask.status)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-400 font-semibold">Ngày hạn:</p>
                <p className="font-bold text-red-600">{formatDate(viewingTask.deadline)}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-gray-500 font-bold">Kết quả công việc:</p>
                <div className="p-3 bg-gray-50 rounded-xl text-gray-800 mt-1 min-h-[50px] whitespace-pre-wrap">
                  {viewingTask.result || "Chưa có kết quả"}
                </div>
              </div>
              <div>
                <p className="text-gray-500 font-bold">Ghi chú:</p>
                <div className="p-3 bg-gray-50 rounded-xl text-gray-800 mt-1 min-h-[40px] whitespace-pre-wrap">
                  {viewingTask.notes || "Không có ghi chú"}
                </div>
              </div>
            </div>
            <div className="pt-2 text-right">
              <button
                onClick={() => setViewingTask(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NESTED MODAL: UPDATE TASK */}
      {updatingTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setUpdatingTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900">Cập Nhật Công Việc [{updatingTask.code}]</h3>
            <form onSubmit={handleSaveUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Trạng thái công việc</label>
                <select
                  value={updateFormData.status}
                  onChange={(e) => setUpdateFormData({ ...updateFormData, status: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                >
                  <option value="TODO">Chưa thực hiện</option>
                  <option value="IN_PROGRESS">Đang thực hiện</option>
                  <option value="PAUSED">Tạm dừng</option>
                  <option value="COMPLETED">Hoàn thành</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Kết quả công việc</label>
                <textarea
                  rows={3}
                  value={updateFormData.result}
                  onChange={(e) => setUpdateFormData({ ...updateFormData, result: e.target.value })}
                  placeholder="Nhập kết quả xử lý công việc..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  value={updateFormData.notes}
                  onChange={(e) => setUpdateFormData({ ...updateFormData, notes: e.target.value })}
                  placeholder="Nhập ghi chú bổ sung..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUpdatingTask(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingUpdate}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {submittingUpdate ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
