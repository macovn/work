"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  X,
  Filter,
  Eye,
  Edit,
  Trash2,
  User as UserIcon,
  Tag,
  ArrowRight,
} from "lucide-react";
import { formatDate, formatPriority, formatStatus } from "@/lib/utils";

interface CalendarTask {
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
}

interface UserItem {
  id: string;
  fullName: string;
  email: string;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 7, 23)); // August 2026 default
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: "ADMIN" | "USER" } | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // Modals
  const [viewingTask, setViewingTask] = useState<CalendarTask | null>(null);
  const [editingTask, setEditingTask] = useState<CalendarTask | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);

  // Task creation/editing form state
  const [formData, setFormData] = useState({
    code: "",
    title: "",
    field: "Công nghệ thông tin",
    assigneeId: "",
    deadline: "",
    priority: "LOW",
    status: "TODO",
    result: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load User & Tasks
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setCurrentUser(data.user);
      })
      .catch(() => {});

    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.users) setUsers(data.users);
      })
      .catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "1000"); // Load all tasks for calendar mapping

      if (assigneeFilter) params.set("assigneeId", assigneeFilter);
      if (fieldFilter) params.set("field", fieldFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [assigneeFilter, fieldFilter, statusFilter, priorityFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Extract unique fields for filter dropdown
  const availableFields = useMemo(() => {
    const fieldsSet = new Set<string>();
    tasks.forEach((t) => {
      if (t.field) fieldsSet.add(t.field);
    });
    return Array.from(fieldsSet);
  }, [tasks]);

  // Current year & month for calendar view
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Month Statistics (filtered by currently displayed month & year)
  const monthStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let inMonthCount = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let overdueCount = 0;

    tasks.forEach((t) => {
      const d = new Date(t.deadline);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        inMonthCount++;
        if (t.status === "COMPLETED") {
          completedCount++;
        } else if (t.status === "IN_PROGRESS") {
          inProgressCount++;
        }
        if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && d < startOfToday) {
          overdueCount++;
        }
      }
    });

    return { inMonthCount, completedCount, inProgressCount, overdueCount };
  }, [tasks, currentYear, currentMonth]);

  // Calendar Grid Calculation (Monday-based: Mon=0, Tue=1, ..., Sun=6)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Get day of week for 1st of month: JS Date.getDay(): Sun=0, Mon=1... -> Convert to Mon=0...Sun=6
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    const cells: Array<{
      date: Date;
      dateNum: number;
      isCurrentMonth: boolean;
      dateKey: string;
      isToday: boolean;
    }> = [];

    const todayStr = new Date().toISOString().slice(0, 10);

    // Previous month padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDateNum = prevMonthLastDay - i;
      const d = new Date(currentYear, currentMonth - 1, prevDateNum);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      cells.push({
        date: d,
        dateNum: prevDateNum,
        isCurrentMonth: false,
        dateKey,
        isToday: dateKey === todayStr,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(currentYear, currentMonth, i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      cells.push({
        date: d,
        dateNum: i,
        isCurrentMonth: true,
        dateKey,
        isToday: dateKey === todayStr,
      });
    }

    // Next month padding days to complete 5 or 6 rows (35 or 42 cells)
    const remainingCells = (35 - (cells.length % 35)) % 35;
    const nextPadding = cells.length <= 35 ? 35 - cells.length : 42 - cells.length;

    for (let i = 1; i <= nextPadding; i++) {
      const d = new Date(currentYear, currentMonth + 1, i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      cells.push({
        date: d,
        dateNum: i,
        isCurrentMonth: false,
        dateKey,
        isToday: dateKey === todayStr,
      });
    }

    return cells;
  }, [currentYear, currentMonth]);

  // Group tasks by dateKey (`YYYY-MM-DD`)
  const tasksByDate = useMemo(() => {
    const map: Record<string, CalendarTask[]> = {};
    tasks.forEach((t) => {
      const d = new Date(t.deadline);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(t);
    });
    return map;
  }, [tasks]);

  // Sidebar: Upcoming Tasks List
  const upcomingTasks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return tasks
      .filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED")
      .map((t) => {
        const d = new Date(t.deadline);
        const dayNum = d.getDate();
        const daysAbbr = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()];

        const diffMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startOfToday.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        let timeText = "";
        if (diffDays < 0) timeText = `Quá hạn ${Math.abs(diffDays)} ngày`;
        else if (diffDays === 0) timeText = "Hôm nay";
        else if (diffDays === 1) timeText = "Ngày mai";
        else timeText = `Còn ${diffDays} ngày`;

        return {
          ...t,
          dayNum,
          daysAbbr,
          timeText,
          deadlineDate: d,
        };
      })
      .sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime())
      .slice(0, 10);
  }, [tasks]);

  // Open Edit Modal
  const openEditModal = (task: CalendarTask) => {
    setEditingTask(task);
    const d = new Date(task.deadline);
    const formattedDeadline = d.toISOString().slice(0, 16);
    setFormData({
      code: task.code,
      title: task.title,
      field: task.field,
      assigneeId: task.assigneeId,
      deadline: formattedDeadline,
      priority: task.priority,
      status: task.status,
      result: task.result || "",
      notes: task.notes || "",
    });
    setFormError("");
  };

  // Open Create Modal
  const openCreateModal = () => {
    setIsCreateModalOpen(true);
    setEditingTask(null);
    setFormData({
      code: `TASK-${String(tasks.length + 1).padStart(3, "0")}`,
      title: "",
      field: "Công nghệ thông tin",
      assigneeId: currentUser?.id || (users[0]?.id || ""),
      deadline: new Date().toISOString().slice(0, 16),
      priority: "LOW",
      status: "TODO",
      result: "",
      notes: "",
    });
    setFormError("");
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      if (editingTask) {
        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi cập nhật");
        setEditingTask(null);
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi tạo công việc");
        setIsCreateModalOpen(false);
      }
      loadTasks();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dayNames = ["THỨ 2", "THỨ 3", "THỨ 4", "THỨ 5", "THỨ 6", "THỨ 7", "CHỦ NHẬT"];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Lịch công việc</h1>
        <p className="text-sm text-gray-500 font-medium">Theo dõi và quản lý tiến độ công việc theo thời gian</p>
      </div>

      {/* 4 Large Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shadow-2xs shrink-0">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-3xl font-black text-gray-900 tracking-tight">{monthStats.inMonthCount}</span>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Công việc trong tháng</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shadow-2xs shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-3xl font-black text-emerald-700 tracking-tight">{monthStats.completedCount}</span>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Đã hoàn thành</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100 shadow-2xs shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-3xl font-black text-amber-700 tracking-tight">{monthStats.inProgressCount}</span>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Đang thực hiện</p>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-4 hover:shadow-md transition">
          <div className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-100 shadow-2xs shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-3xl font-black text-red-600 tracking-tight">{monthStats.overdueCount}</span>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Quá hạn</p>
          </div>
        </div>
      </div>

      {/* Top Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Người thực hiện</label>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <label className="block text-xs font-bold text-gray-700 mb-1">Lĩnh vực</label>
          <select
            value={fieldFilter}
            onChange={(e) => setFieldFilter(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <label className="block text-xs font-bold text-gray-700 mb-1">Trạng thái</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả</option>
            <option value="TODO">Chưa thực hiện</option>
            <option value="IN_PROGRESS">Đang thực hiện</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="COMPLETED">Hoàn thành</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">Ưu tiên</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả</option>
            <option value="HIGH">Rất gấp</option>
            <option value="MEDIUM">Gấp</option>
            <option value="LOW">Bình thường</option>
          </select>
        </div>
      </div>

      {/* Main Content Area: Left Month Grid & Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT SECTION: MONTH CALENDAR GRID (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          {/* Blue Header Bar */}
          <div className="bg-blue-600 text-white p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl transition cursor-pointer"
                title="Tháng trước"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-black tracking-wide">
                Tháng {currentMonth + 1} Năm {currentYear}
              </h2>
              <button
                onClick={handleNextMonth}
                className="p-1.5 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl transition cursor-pointer"
                title="Tháng sau"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToday}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Hôm nay
              </button>
              <button
                onClick={openCreateModal}
                className="px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Thêm việc
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/80 text-center font-bold text-[11px] text-gray-700 py-2.5">
            {dayNames.map((day, idx) => (
              <div key={idx} className={idx >= 5 ? "text-red-600" : ""}>
                {day}
              </div>
            ))}
          </div>

          {/* Month Calendar Day Cells */}
          {loading ? (
            <div className="p-12 text-center text-sm font-semibold text-gray-500">Đang tải lịch công việc...</div>
          ) : (
            <div className="grid grid-cols-7 divide-x divide-y divide-gray-100 bg-gray-50/20">
              {calendarCells.map((cell, idx) => {
                const dayTasks = tasksByDate[cell.dateKey] || [];

                return (
                  <div
                    key={idx}
                    className={`min-h-[135px] sm:min-h-[145px] p-2 flex flex-col justify-between transition ${
                      !cell.isCurrentMonth ? "bg-gray-50/60 opacity-40" : "bg-white"
                    } ${cell.isToday ? "bg-blue-50/30 ring-2 ring-blue-400 inset-0 z-10" : ""}`}
                  >
                    {/* Date Number Badge */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-black inline-flex items-center justify-center ${
                          cell.isToday
                            ? "w-6 h-6 bg-blue-600 text-white rounded-full shadow-xs"
                            : cell.date.getDay() === 0 || cell.date.getDay() === 6
                            ? "text-red-500"
                            : "text-gray-900"
                        }`}
                      >
                        {cell.dateNum}
                      </span>
                    </div>

                    {/* Task Pills list */}
                    <div className="space-y-1 overflow-hidden flex-1">
                      {dayTasks.slice(0, 3).map((task) => {
                        const isOverdue =
                          task.status !== "COMPLETED" &&
                          task.status !== "CANCELLED" &&
                          new Date(task.deadline) < new Date();
                        const isCompleted = task.status === "COMPLETED";

                        return (
                          <div
                            key={task.id}
                            onClick={() => setViewingTask(task)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold truncate cursor-pointer transition flex items-center gap-1 ${
                              isCompleted
                                ? "bg-emerald-100/80 text-emerald-800 border border-emerald-200"
                                : isOverdue || task.priority === "HIGH"
                                ? "bg-emerald-100/70 text-emerald-950 border border-emerald-300 font-bold"
                                : task.status === "IN_PROGRESS"
                                ? "bg-emerald-100/90 text-emerald-900"
                                : "bg-emerald-100/60 text-emerald-900"
                            }`}
                            title={`[${task.code}] ${task.title} - ${task.assignee.fullName}`}
                          >
                            <span className="shrink-0">{isOverdue || task.priority === "HIGH" ? "!!" : "•"}</span>
                            <span className="truncate">{task.title}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Show more button if >3 tasks */}
                    {dayTasks.length > 3 && (
                      <button
                        onClick={() => setDayModalDate(cell.dateKey)}
                        className="text-[10px] font-extrabold text-blue-600 hover:underline mt-1 text-left cursor-pointer"
                      >
                        + {dayTasks.length - 3} việc khác
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT SECTION: UPCOMING TASKS SIDEBAR (4 cols) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="font-bold text-gray-900 text-base">Công việc sắp tới</h3>
            <a href="/tasks" className="text-xs font-bold text-blue-600 hover:underline">
              Xem tất cả
            </a>
          </div>

          {upcomingTasks.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500">🎉 Không có công việc nào sắp đến hạn</div>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setViewingTask(t)}
                  className="p-3 bg-gray-50/80 hover:bg-gray-100/80 rounded-2xl border border-gray-100 transition cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100/80 text-blue-700 rounded-2xl flex flex-col items-center justify-center shrink-0 border border-blue-200">
                      <span className="text-sm font-black leading-none">{t.dayNum}</span>
                      <span className="text-[9px] font-extrabold leading-none mt-0.5">{t.daysAbbr}</span>
                    </div>

                    <div className="space-y-0.5 max-w-[170px]">
                      <h4 className="font-bold text-gray-900 text-xs truncate" title={t.title}>
                        {t.title}
                      </h4>
                      <p className="text-[11px] text-gray-500 font-medium">{t.assignee.fullName}</p>
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                          t.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-800"
                            : t.status === "PAUSED"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {formatStatus(t.status)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-gray-400 shrink-0">{t.timeText}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: VIEW TASK DETAILS */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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
            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => {
                  setViewingTask(null);
                  openEditModal(viewingTask);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1"
              >
                <Edit className="w-3.5 h-3.5" /> Chỉnh sửa
              </button>
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

      {/* MODAL 2: CREATE / EDIT TASK */}
      {(isCreateModalOpen || editingTask) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative my-8">
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                setEditingTask(null);
              }}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900">
              {editingTask ? "Chỉnh Sửa Công Việc" : "Tạo Công Việc Mới"}
            </h3>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl">{formError}</div>
            )}

            <form onSubmit={handleSaveTask} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Mã công việc *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Lĩnh vực *</label>
                  <input
                    type="text"
                    required
                    value={formData.field}
                    onChange={(e) => setFormData({ ...formData, field: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Tên công việc *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Người thực hiện *</label>
                  <select
                    value={formData.assigneeId}
                    onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Ngày hạn *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Ưu tiên</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                  >
                    <option value="LOW">Bình thường</option>
                    <option value="MEDIUM">Gấp</option>
                    <option value="HIGH">Rất gấp</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Trạng thái</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                  >
                    <option value="TODO">Chưa thực hiện</option>
                    <option value="IN_PROGRESS">Đang thực hiện</option>
                    <option value="PAUSED">Tạm dừng</option>
                    <option value="COMPLETED">Hoàn thành</option>
                    <option value="CANCELLED">Hủy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Kết quả công việc</label>
                <textarea
                  rows={2}
                  value={formData.result}
                  onChange={(e) => setFormData({ ...formData, result: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingTask(null);
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu công việc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DAY TASKS LIST */}
      {dayModalDate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setDayModalDate(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Công việc ngày {formatDate(dayModalDate)}
              </h3>
              <p className="text-xs text-gray-500">
                Tổng số {(tasksByDate[dayModalDate] || []).length} công việc
              </p>
            </div>

            <div className="overflow-y-auto space-y-2.5 max-h-[60vh] pr-1">
              {(tasksByDate[dayModalDate] || []).map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setDayModalDate(null);
                    setViewingTask(t);
                  }}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition cursor-pointer flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-mono text-[10px] font-black text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                      {t.code}
                    </span>
                    <h4 className="font-bold text-gray-900">{t.title}</h4>
                    <p className="text-gray-500 text-[11px]">Người làm: {t.assignee.fullName}</p>
                  </div>
                  <span className="font-bold text-blue-600 hover:underline">Chi tiết &rarr;</span>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setDayModalDate(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
