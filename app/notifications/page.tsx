"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  Calendar,
  Clock,
  RefreshCw,
  AlertCircle,
  Info,
  MoreHorizontal,
  ChevronRight,
  Filter,
  ArrowUpDown,
  X,
  Check,
  Edit,
  Eye,
} from "lucide-react";
import { formatDate, formatPriority, formatStatus } from "@/lib/utils";

interface ReminderTask {
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
}

export default function WorkRemindersPage() {
  const [tasks, setTasks] = useState<ReminderTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: "ALL" | "OVERDUE" | "NEXT_3_DAYS" | "NOT_UPDATED"
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("ASC");

  // Modals
  const [viewingTask, setViewingTask] = useState<ReminderTask | null>(null);
  const [updatingTask, setUpdatingTask] = useState<ReminderTask | null>(null);
  const [updateFormData, setUpdateFormData] = useState({
    status: "COMPLETED",
    result: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?limit=1000");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Date thresholds
  const now = new Date();
  const startOfToday = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);
  const endOfToday = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999), [now]);
  const endOf3Days = useMemo(() => new Date(startOfToday.getTime() + 4 * 24 * 60 * 60 * 1000 - 1), [startOfToday]);
  const threeDaysAgo = useMemo(() => new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), [now]);

  // 1. Group 1: Overdue Tasks
  const overdueTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < startOfToday)
      .sort((a, b) => {
        const tA = new Date(a.deadline).getTime();
        const tB = new Date(b.deadline).getTime();
        return sortOrder === "ASC" ? tA - tB : tB - tA;
      });
  }, [tasks, startOfToday, sortOrder]);

  // 2. Group 2: Next 3 Days Tasks
  const next3DaysTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) >= startOfToday && new Date(t.deadline) <= endOf3Days)
      .sort((a, b) => {
        const tA = new Date(a.deadline).getTime();
        const tB = new Date(b.deadline).getTime();
        return sortOrder === "ASC" ? tA - tB : tB - tA;
      });
  }, [tasks, startOfToday, endOf3Days, sortOrder]);

  // 3. Group 3: Not Updated in 3 Days Tasks
  const notUpdated3DaysTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.updatedAt) < threeDaysAgo)
      .sort((a, b) => {
        const tA = new Date(a.updatedAt).getTime();
        const tB = new Date(b.updatedAt).getTime();
        return sortOrder === "ASC" ? tA - tB : tB - tA;
      });
  }, [tasks, threeDaysAgo, sortOrder]);

  // Helper for Initials (Avatar)
  const getInitials = (name: string) => {
    if (!name) return "CV";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Helper for Days calculation text
  const getOverdueText = (deadlineStr: string) => {
    const d = new Date(deadlineStr);
    const diffMs = startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    return `${diffDays} ngày quá hạn`;
  };

  const getNext3DaysText = (deadlineStr: string) => {
    const d = new Date(deadlineStr);
    const diffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startOfToday.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Đến hạn hôm nay";
    if (diffDays === 1) return "1 ngày nữa";
    return `${diffDays} ngày nữa`;
  };

  const getNotUpdatedText = (updatedAtStr: string) => {
    const d = new Date(updatedAtStr);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    return `${diffDays} ngày trước`;
  };

  // Handle task update
  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingTask) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${updatingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateFormData),
      });
      if (res.ok) {
        setUpdatingTask(null);
        loadTasks();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-2xs">
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Nhắc việc - cảnh báo</h1>
          <p className="text-xs text-gray-500 font-medium">Theo dõi và xử lý các công việc cần chú ý</p>
        </div>
      </div>

      {/* TOP 3 TREND SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Việc quá hạn */}
        <div
          onClick={() => setActiveTab(activeTab === "OVERDUE" ? "ALL" : "OVERDUE")}
          className={`bg-white p-5 rounded-3xl border transition cursor-pointer relative overflow-hidden flex items-center justify-between gap-4 ${
            activeTab === "OVERDUE"
              ? "border-red-400 ring-2 ring-red-200 shadow-md"
              : "border-gray-200 hover:shadow-md shadow-xs"
          }`}
        >
          <div className="flex items-center gap-4 z-10">
            <div className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-gray-500 block">Việc quá hạn</span>
              <span className="text-3xl font-black text-red-600">{overdueTasks.length}</span>
              <p className="text-[11px] font-medium text-gray-400">Công việc cần xử lý ngay</p>

              <div className="pt-1">
                <span className="px-3 py-1 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 font-bold text-[11px] rounded-xl inline-flex items-center gap-1 transition">
                  Xem chi tiết &rarr;
                </span>
              </div>
            </div>
          </div>

          {/* Sparkline Background Graph */}
          <div className="absolute right-0 bottom-0 w-36 h-20 opacity-30 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 50">
              <path
                d="M0,45 Q20,35 40,40 T80,15 T100,5"
                fill="none"
                stroke="#ef4444"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Sắp đến hạn trong 3 ngày */}
        <div
          onClick={() => setActiveTab(activeTab === "NEXT_3_DAYS" ? "ALL" : "NEXT_3_DAYS")}
          className={`bg-white p-5 rounded-3xl border transition cursor-pointer relative overflow-hidden flex items-center justify-between gap-4 ${
            activeTab === "NEXT_3_DAYS"
              ? "border-amber-400 ring-2 ring-amber-200 shadow-md"
              : "border-gray-200 hover:shadow-md shadow-xs"
          }`}
        >
          <div className="flex items-center gap-4 z-10">
            <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-md shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-gray-500 block">Sắp đến hạn trong 3 ngày</span>
              <span className="text-3xl font-black text-amber-600">{next3DaysTasks.length}</span>
              <p className="text-[11px] font-medium text-gray-400">Công việc sắp đến hạn</p>

              <div className="pt-1">
                <span className="px-3 py-1 bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100 font-bold text-[11px] rounded-xl inline-flex items-center gap-1 transition">
                  Xem chi tiết &rarr;
                </span>
              </div>
            </div>
          </div>

          {/* Sparkline Background Graph */}
          <div className="absolute right-0 bottom-0 w-36 h-20 opacity-30 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 50">
              <path
                d="M0,40 Q25,45 50,30 T80,20 T100,8"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 3: Chưa cập nhật trong 3 ngày */}
        <div
          onClick={() => setActiveTab(activeTab === "NOT_UPDATED" ? "ALL" : "NOT_UPDATED")}
          className={`bg-white p-5 rounded-3xl border transition cursor-pointer relative overflow-hidden flex items-center justify-between gap-4 ${
            activeTab === "NOT_UPDATED"
              ? "border-blue-400 ring-2 ring-blue-200 shadow-md"
              : "border-gray-200 hover:shadow-md shadow-xs"
          }`}
        >
          <div className="flex items-center gap-4 z-10">
            <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-md shrink-0">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-gray-500 block">Chưa cập nhật trong 3 ngày</span>
              <span className="text-3xl font-black text-blue-600">{notUpdated3DaysTasks.length}</span>
              <p className="text-[11px] font-medium text-gray-400">Công việc cần cập nhật</p>

              <div className="pt-1">
                <span className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 font-bold text-[11px] rounded-xl inline-flex items-center gap-1 transition">
                  Xem chi tiết &rarr;
                </span>
              </div>
            </div>
          </div>

          {/* Sparkline Background Graph */}
          <div className="absolute right-0 bottom-0 w-36 h-20 opacity-30 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 50">
              <path
                d="M0,45 Q30,20 60,35 T90,15 T100,5"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* TAB BAR & FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "ALL"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100/80 text-gray-700 hover:bg-gray-200"
            }`}
          >
            ≡ Tất cả
          </button>
          <button
            onClick={() => setActiveTab("OVERDUE")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "OVERDUE"
                ? "bg-red-600 text-white shadow-sm"
                : "bg-gray-100/80 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500" /> Việc quá hạn
          </button>
          <button
            onClick={() => setActiveTab("NEXT_3_DAYS")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "NEXT_3_DAYS"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-gray-100/80 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Sắp đến hạn
          </button>
          <button
            onClick={() => setActiveTab("NOT_UPDATED")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "NOT_UPDATED"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100/80 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Chưa cập nhật
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC")}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
            Hạn cuối ({sortOrder === "ASC" ? "Gần nhất" : "Xa nhất"})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm font-semibold text-gray-500 bg-white rounded-3xl border border-gray-200">
          Đang tải dữ liệu nhắc việc & cảnh báo...
        </div>
      ) : (
        <div className="space-y-6">
          {/* GROUP 1: VIỆC QUÁ HẠN */}
          {(activeTab === "ALL" || activeTab === "OVERDUE") && (
            <div className="bg-red-50/40 rounded-3xl border border-red-100 p-4 sm:p-5 space-y-4">
              {/* Group Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center">
                    !
                  </div>
                  <h3 className="font-bold text-red-900 text-base">
                    Việc quá hạn ({overdueTasks.length})
                  </h3>
                </div>
              </div>

              {overdueTasks.length === 0 ? (
                <div className="p-6 text-center text-xs font-semibold text-gray-500 bg-white/80 rounded-2xl border border-red-100">
                  🎉 Không có công việc nào bị quá hạn!
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl border border-red-100/90 divide-y divide-gray-100 overflow-hidden shadow-2xs">
                    {overdueTasks.slice(0, activeTab === "OVERDUE" ? 100 : 5).map((t) => (
                      <div
                        key={t.id}
                        className="p-4 hover:bg-red-50/30 transition flex flex-col md:grid md:grid-cols-[auto_1fr_190px_140px_110px_110px_40px] items-center gap-3 md:gap-4 text-xs"
                      >
                        {/* Col 1: Icon */}
                        <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 font-black text-xs flex items-center justify-center shrink-0 border border-red-200">
                          !
                        </div>

                        {/* Col 2: Task Info */}
                        <div className="min-w-0 pr-2 space-y-0.5 w-full">
                          <h4 className="font-bold text-gray-900 text-sm leading-snug truncate" title={t.title}>
                            {t.title}
                          </h4>
                          <span className="font-mono text-[11px] font-bold text-gray-400 block">
                            Mã CV: {t.code}
                          </span>
                        </div>

                        {/* Col 3: Assignee */}
                        <div className="flex items-center gap-2.5 w-full md:w-[190px] shrink-0">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                            {getInitials(t.assignee.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-xs truncate">{t.assignee.fullName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">Nhân viên</p>
                          </div>
                        </div>

                        {/* Col 4: Deadline */}
                        <div className="w-full md:w-[140px] shrink-0">
                          <p className="font-bold text-red-600 text-xs">{formatDate(t.deadline)}</p>
                          <p className="text-[10px] font-bold text-red-500">{getOverdueText(t.deadline)}</p>
                        </div>

                        {/* Col 5: Priority */}
                        <div className="w-full md:w-[110px] shrink-0 flex items-center justify-start">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            {formatPriority(t.priority)}
                          </span>
                        </div>

                        {/* Col 6: Status */}
                        <div className="w-full md:w-[110px] shrink-0 flex items-center justify-start">
                          <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            Quá hạn
                          </span>
                        </div>

                        {/* Col 7: Action */}
                        <div className="w-full md:w-[40px] shrink-0 flex items-center justify-end">
                          <button
                            onClick={() => {
                              setUpdatingTask(t);
                              setUpdateFormData({
                                status: t.status,
                                result: t.result || "",
                                notes: t.notes || "",
                              });
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 transition cursor-pointer"
                            title="Cập nhật công việc"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeTab === "ALL" && overdueTasks.length > 5 && (
                    <button
                      onClick={() => setActiveTab("OVERDUE")}
                      className="text-xs font-bold text-blue-600 hover:underline pt-1 inline-flex items-center gap-1 cursor-pointer"
                    >
                      Xem tất cả {overdueTasks.length} công việc quá hạn &rarr;
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* GROUP 2: SẮP ĐẾN HẠN TRONG 3 NGÀY */}
          {(activeTab === "ALL" || activeTab === "NEXT_3_DAYS") && (
            <div className="bg-amber-50/40 rounded-3xl border border-amber-100 p-4 sm:p-5 space-y-4">
              {/* Group Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center">
                    !
                  </div>
                  <h3 className="font-bold text-amber-900 text-base">
                    Sắp đến hạn trong 3 ngày ({next3DaysTasks.length})
                  </h3>
                </div>
              </div>

              {next3DaysTasks.length === 0 ? (
                <div className="p-6 text-center text-xs font-semibold text-gray-500 bg-white/80 rounded-2xl border border-amber-100">
                  🎉 Không có công việc nào sắp đến hạn trong 3 ngày tới!
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl border border-amber-100/90 divide-y divide-gray-100 overflow-hidden shadow-2xs">
                    {next3DaysTasks.slice(0, activeTab === "NEXT_3_DAYS" ? 100 : 5).map((t) => (
                      <div
                        key={t.id}
                        className="p-4 hover:bg-amber-50/30 transition flex flex-col md:grid md:grid-cols-[auto_1fr_190px_140px_110px_110px_40px] items-center gap-3 md:gap-4 text-xs"
                      >
                        {/* Col 1: Icon */}
                        <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 font-black text-xs flex items-center justify-center shrink-0 border border-amber-200">
                          !
                        </div>

                        {/* Col 2: Task Info */}
                        <div className="min-w-0 pr-2 space-y-0.5 w-full">
                          <h4 className="font-bold text-gray-900 text-sm leading-snug truncate" title={t.title}>
                            {t.title}
                          </h4>
                          <span className="font-mono text-[11px] font-bold text-gray-400 block">
                            Mã CV: {t.code}
                          </span>
                        </div>

                        {/* Col 3: Assignee */}
                        <div className="flex items-center gap-2.5 w-full md:w-[190px] shrink-0">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                            {getInitials(t.assignee.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-xs truncate">{t.assignee.fullName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">Nhân viên</p>
                          </div>
                        </div>

                        {/* Col 4: Deadline */}
                        <div className="w-full md:w-[140px] shrink-0">
                          <p className="font-bold text-gray-800 text-xs">{formatDate(t.deadline)}</p>
                          <p className="text-[10px] font-bold text-amber-600">{getNext3DaysText(t.deadline)}</p>
                        </div>

                        {/* Col 5: Priority */}
                        <div className="w-full md:w-[110px] shrink-0 flex items-center justify-start">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            {formatPriority(t.priority)}
                          </span>
                        </div>

                        {/* Col 6: Status */}
                        <div className="w-full md:w-[110px] shrink-0 flex items-center justify-start">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            {formatStatus(t.status)}
                          </span>
                        </div>

                        {/* Col 7: Action */}
                        <div className="w-full md:w-[40px] shrink-0 flex items-center justify-end">
                          <button
                            onClick={() => {
                              setUpdatingTask(t);
                              setUpdateFormData({
                                status: t.status,
                                result: t.result || "",
                                notes: t.notes || "",
                              });
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 transition cursor-pointer"
                            title="Cập nhật công việc"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeTab === "ALL" && next3DaysTasks.length > 5 && (
                    <button
                      onClick={() => setActiveTab("NEXT_3_DAYS")}
                      className="text-xs font-bold text-blue-600 hover:underline pt-1 inline-flex items-center gap-1 cursor-pointer"
                    >
                      Xem tất cả {next3DaysTasks.length} công việc sắp đến hạn &rarr;
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* GROUP 3: CHƯA CẬP NHẬT TRONG 3 NGÀY */}
          {(activeTab === "ALL" || activeTab === "NOT_UPDATED") && (
            <div className="bg-blue-50/40 rounded-3xl border border-blue-100 p-4 sm:p-5 space-y-4">
              {/* Group Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                    i
                  </div>
                  <h3 className="font-bold text-blue-900 text-base">
                    Chưa cập nhật trong 3 ngày ({notUpdated3DaysTasks.length})
                  </h3>
                </div>
              </div>

              {notUpdated3DaysTasks.length === 0 ? (
                <div className="p-6 text-center text-xs font-semibold text-gray-500 bg-white/80 rounded-2xl border border-blue-100">
                  🎉 Tất cả công việc đều đã được cập nhật gần đây!
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl border border-blue-100/90 divide-y divide-gray-100 overflow-hidden shadow-2xs">
                    {notUpdated3DaysTasks.slice(0, activeTab === "NOT_UPDATED" ? 100 : 5).map((t) => (
                      <div
                        key={t.id}
                        className="p-4 hover:bg-blue-50/30 transition flex flex-col md:grid md:grid-cols-[auto_1fr_190px_140px_110px_110px_40px] items-center gap-3 md:gap-4 text-xs"
                      >
                        {/* Col 1: Icon */}
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-black text-xs flex items-center justify-center shrink-0 border border-blue-200">
                          i
                        </div>

                        {/* Col 2: Task Info */}
                        <div className="min-w-0 pr-2 space-y-0.5 w-full">
                          <h4 className="font-bold text-gray-900 text-sm leading-snug truncate" title={t.title}>
                            {t.title}
                          </h4>
                          <span className="font-mono text-[11px] font-bold text-gray-400 block">
                            Mã CV: {t.code}
                          </span>
                        </div>

                        {/* Col 3: Assignee */}
                        <div className="flex items-center gap-2.5 w-full md:w-[190px] shrink-0">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                            {getInitials(t.assignee.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 text-xs truncate">{t.assignee.fullName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">Nhân viên</p>
                          </div>
                        </div>

                        {/* Col 4: Deadline */}
                        <div className="w-full md:w-[140px] shrink-0">
                          <p className="font-bold text-gray-800 text-xs">{formatDate(t.updatedAt)}</p>
                          <p className="text-[10px] font-bold text-gray-400">{getNotUpdatedText(t.updatedAt)}</p>
                        </div>

                        {/* Col 5: Priority */}
                        <div className="w-full md:w-[110px] shrink-0 flex items-center justify-start">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            {formatPriority(t.priority)}
                          </span>
                        </div>

                        {/* Col 6: Status */}
                        <div className="w-full md:w-[110px] shrink-0 flex items-center justify-start">
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[11px] font-bold whitespace-nowrap">
                            Chưa cập nhật
                          </span>
                        </div>

                        {/* Col 7: Action */}
                        <div className="w-full md:w-[40px] shrink-0 flex items-center justify-end">
                          <button
                            onClick={() => {
                              setUpdatingTask(t);
                              setUpdateFormData({
                                status: t.status,
                                result: t.result || "",
                                notes: t.notes || "",
                              });
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 transition cursor-pointer"
                            title="Cập nhật công việc"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeTab === "ALL" && notUpdated3DaysTasks.length > 5 && (
                    <button
                      onClick={() => setActiveTab("NOT_UPDATED")}
                      className="text-xs font-bold text-blue-600 hover:underline pt-1 inline-flex items-center gap-1 cursor-pointer"
                    >
                      Xem tất cả {notUpdated3DaysTasks.length} công việc chưa cập nhật &rarr;
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: VIEW DETAILS */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setViewingTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 cursor-pointer"
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
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: UPDATE TASK */}
      {updatingTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setUpdatingTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900">Cập Nhật Công Việc [{updatingTask.code}]</h3>
            <form onSubmit={handleSaveUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Trạng thái công việc</label>
                <select
                  value={updateFormData.status}
                  onChange={(e) => setUpdateFormData({ ...updateFormData, status: e.target.value as any })}
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
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
