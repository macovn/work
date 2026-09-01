"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Edit,
  Trash2,
  Eye,
  User,
  Tag,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  FileSpreadsheet,
  Download,
  Award,
  Star,
} from "lucide-react";
import { formatDate, formatPriority, formatStatus, formatTaskType } from "@/lib/utils";

interface TaskItem {
  id: string;
  code: string;
  title: string;
  field: string;
  assigneeId: string;
  assignee: { id: string; fullName: string; email: string };
  deadline: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  taskType: "RECURRING" | "AD_HOC";
  status: "TODO" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  result?: string | null;
  notes?: string | null;

  // Standard Task Catalog & Score Snapshot Fields
  positionId?: string | null;
  position?: { id: string; name: string; code: string } | null;
  groupId?: string | null;
  group?: { id: string; name: string; code: string; weight?: number } | null;
  standardTaskId?: string | null;
  standardTask?: {
    id: string;
    name: string;
    code: string;
    unit: string;
    benchmarkScore: number;
    complexityLevel: "N1" | "N2" | "N3" | "N4" | "N5";
    conversionFactor: number;
  } | null;
  unit?: string | null;
  benchmarkScore?: number | null;
  complexityLevel?: "N1" | "N2" | "N3" | "N4" | "N5" | null;
  conversionFactor?: number | null;
  assignedVolume?: number | null;
  completedVolume?: number | null;
  assignedScore?: number | null;
  completedScore?: number | null;
  completionRate?: number | null;

  // KPI fields
  kpiQuantity?: number | null;
  kpiProgress?: number | null;
  kpiQuality?: number | null;
  kpiScore?: number | null;
  kpiEvaluatorId?: string | null;
  kpiEvaluator?: { id: string; fullName: string; email: string } | null;
  kpiEvaluatedAt?: string | null;
  kpiComment?: string | null;
}

interface UserItem {
  id: string;
  fullName: string;
  email: string;
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [standardTasks, setStandardTasks] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: "ADMIN" | "USER" } | null>(null);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter states
  const [search, setSearch] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [viewingTask, setViewingTask] = useState<TaskItem | null>(null);

  // Import Excel modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    message: string;
    importedCount: number;
    errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState("");

  // KPI Scoring modal state
  const [kpiModalTask, setKpiModalTask] = useState<TaskItem | null>(null);
  const [kpiFormData, setKpiFormData] = useState({
    kpiQuantity: "100",
    kpiProgress: "100",
    kpiQuality: "100",
    kpiComment: "",
  });
  const [kpiFormError, setKpiFormError] = useState("");
  const [isSubmittingKpi, setIsSubmittingKpi] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    code: "",
    title: "",
    field: "Công nghệ thông tin",
    assigneeId: "",
    deadline: "",
    priority: "LOW",
    taskType: "RECURRING",
    status: "TODO",
    result: "",
    notes: "",
    positionId: "",
    groupId: "",
    standardTaskId: "",
    unit: "",
    benchmarkScore: "",
    complexityLevel: "",
    conversionFactor: "",
    assignedVolume: "1",
    completedVolume: "",
  });

  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const computedAssignedScore =
    formData.benchmarkScore && formData.conversionFactor && formData.assignedVolume
      ? Number(
          (
            Number(formData.assignedVolume) *
            Number(formData.benchmarkScore) *
            Number(formData.conversionFactor)
          ).toFixed(2)
        )
      : null;

  const computedCompletedScore =
    formData.benchmarkScore && formData.conversionFactor && formData.completedVolume
      ? Number(
          (
            Number(formData.completedVolume) *
            Number(formData.benchmarkScore) *
            Number(formData.conversionFactor)
          ).toFixed(2)
        )
      : null;

  const computedCompletionRate =
    computedAssignedScore && computedAssignedScore > 0 && computedCompletedScore !== null
      ? Number(((computedCompletedScore / computedAssignedScore) * 100).toFixed(2))
      : null;

  // Fetch current user details & catalogs
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setCurrentUser(data.user);
      });

    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.users) setUsers(data.users);
      })
      .catch(() => {});

    fetch("/api/job-positions")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPositions(data);
      })
      .catch(() => {});

    fetch("/api/standard-tasks")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setStandardTasks(data);
      })
      .catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());

      const paramId = searchParams.get("id");
      if (paramId) params.set("id", paramId);

      if (search) params.set("search", search);
      if (fieldFilter) params.set("field", fieldFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (taskTypeFilter) params.set("taskType", taskTypeFilter);
      if (assigneeFilter) params.set("assigneeId", assigneeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
        const fetchedTotalPages = data.pagination.totalPages || 1;
        setTotalPages(fetchedTotalPages);
        setTotal(data.pagination.total || 0);

        if (page > fetchedTotalPages && fetchedTotalPages > 0) {
          setPage(fetchedTotalPages);
        }

        // If direct task id view requested
        if (paramId && data.tasks.length > 0) {
          setViewingTask(data.tasks[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, fieldFilter, statusFilter, priorityFilter, taskTypeFilter, assigneeFilter, startDate, endDate, searchParams]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleStandardTaskChange = (stdTaskId: string) => {
    if (!stdTaskId) {
      setFormData((prev) => ({
        ...prev,
        standardTaskId: "",
        unit: "",
        benchmarkScore: "",
        complexityLevel: "",
        conversionFactor: "",
      }));
      return;
    }

    const found = standardTasks.find((t) => t.id === stdTaskId);
    if (found) {
      setFormData((prev) => ({
        ...prev,
        standardTaskId: found.id,
        positionId: found.positionId || prev.positionId,
        groupId: found.groupId || prev.groupId,
        title: prev.title ? prev.title : found.name,
        field: found.position?.name ? `Vị trí ${found.position.name}` : prev.field,
        unit: found.unit,
        benchmarkScore: String(found.benchmarkScore),
        complexityLevel: found.complexityLevel,
        conversionFactor: String(found.conversionFactor),
        assignedVolume: prev.assignedVolume || "1",
      }));
    }
  };

  const openCreateModal = () => {
    setFormData({
      code: `TASK-${Math.floor(100 + Math.random() * 900)}`,
      title: "",
      field: "Dân số",
      assigneeId: users[0]?.id || "",
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      priority: "LOW",
      taskType: "RECURRING",
      status: "TODO",
      result: "",
      notes: "",
      positionId: positions[0]?.id || "",
      groupId: "",
      standardTaskId: "",
      unit: "",
      benchmarkScore: "",
      complexityLevel: "",
      conversionFactor: "",
      assignedVolume: "1",
      completedVolume: "",
    });
    setFormError("");
    setIsCreateModalOpen(true);
  };

  const openEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setFormData({
      code: task.code,
      title: task.title,
      field: task.field,
      assigneeId: task.assigneeId,
      deadline: new Date(task.deadline).toISOString().slice(0, 16),
      priority: task.priority,
      taskType: task.taskType || "RECURRING",
      status: task.status,
      result: task.result || "",
      notes: task.notes || "",
      positionId: task.positionId || "",
      groupId: task.groupId || "",
      standardTaskId: task.standardTaskId || "",
      unit: task.unit || "",
      benchmarkScore: task.benchmarkScore !== null && task.benchmarkScore !== undefined ? String(task.benchmarkScore) : "",
      complexityLevel: task.complexityLevel || "",
      conversionFactor: task.conversionFactor !== null && task.conversionFactor !== undefined ? String(task.conversionFactor) : "",
      assignedVolume: task.assignedVolume !== null && task.assignedVolume !== undefined ? String(task.assignedVolume) : "",
      completedVolume: task.completedVolume !== null && task.completedVolume !== undefined ? String(task.completedVolume) : "",
    });
    setFormError("");
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      if (editingTask) {
        // PATCH
        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi cập nhật");

        setEditingTask(null);
      } else {
        // POST
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

  const handleDeleteTask = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa công việc này không?")) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadTasks();
      } else {
        const data = await res.json();
        alert(data.error || "Lỗi xóa công việc");
      }
    } catch (e) {
      alert("Lỗi kết nối");
    }
  };

  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      setImportError("Vui lòng chọn 1 file Excel (.xlsx, .xls)");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const res = await fetch("/api/tasks/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi Import file");

      setImportResult(data);
      loadTasks();
    } catch (err: any) {
      setImportError(err.message || "Lỗi khi kết nối hệ thống");
    } finally {
      setImporting(false);
    }
  };

  const openKpiModal = (task: TaskItem) => {
    setKpiModalTask(task);
    setKpiFormData({
      kpiQuantity: task.kpiQuantity !== null && task.kpiQuantity !== undefined ? String(task.kpiQuantity) : "100",
      kpiProgress: task.kpiProgress !== null && task.kpiProgress !== undefined ? String(task.kpiProgress) : "100",
      kpiQuality: task.kpiQuality !== null && task.kpiQuality !== undefined ? String(task.kpiQuality) : "100",
      kpiComment: task.kpiComment || "",
    });
    setKpiFormError("");
  };

  const handleSaveKpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kpiModalTask) return;

    setKpiFormError("");
    setIsSubmittingKpi(true);

    const quantityNum = parseFloat(kpiFormData.kpiQuantity);
    const progressNum = parseFloat(kpiFormData.kpiProgress);
    const qualityNum = parseFloat(kpiFormData.kpiQuality);

    if (
      isNaN(quantityNum) || quantityNum < 0 || quantityNum > 100 ||
      isNaN(progressNum) || progressNum < 0 || progressNum > 100 ||
      isNaN(qualityNum) || qualityNum < 0 || qualityNum > 100
    ) {
      setKpiFormError("Bắt buộc phải nhập đầy đủ 3 tiêu chí điểm (Số lượng, Tiến độ, Chất lượng) từ 0 đến 100");
      setIsSubmittingKpi(false);
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${kpiModalTask.id}/kpi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpiQuantity: quantityNum,
          kpiProgress: progressNum,
          kpiQuality: qualityNum,
          kpiComment: kpiFormData.kpiComment,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi lưu điểm KPI");

      setKpiModalTask(null);
      loadTasks();
    } catch (err: any) {
      setKpiFormError(err.message);
    } finally {
      setIsSubmittingKpi(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Quản Lý Công Việc</h1>
          <p className="text-sm text-gray-500">Danh sách công việc & bộ lọc tìm kiếm nâng cao (Tổng: {total})</p>
        </div>

        {currentUser?.role === "ADMIN" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
            >
              <FileSpreadsheet className="w-4 h-4" /> Import Excel
            </button>
            <button
              onClick={openCreateModal}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4" /> Tạo Công Việc Mới
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Từ khóa (Mã, Tên, Lĩnh vực)..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Trạng thái --</option>
            <option value="TODO">Chưa thực hiện</option>
            <option value="IN_PROGRESS">Đang thực hiện</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="CANCELLED">Hủy</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Độ ưu tiên --</option>
            <option value="LOW">Bình thường</option>
            <option value="MEDIUM">Gấp</option>
            <option value="HIGH">Rất gấp</option>
          </select>

          <select
            value={taskTypeFilter}
            onChange={(e) => {
              setTaskTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Loại công việc --</option>
            <option value="RECURRING">Thường xuyên</option>
            <option value="AD_HOC">Đột xuất</option>
          </select>

          {currentUser?.role === "ADMIN" && (
            <select
              value={assigneeFilter}
              onChange={(e) => {
                setAssigneeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Người thực hiện --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-semibold">Khoảng ngày:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs"
            />
            <span className="text-gray-400">&rarr;</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs"
            />
          </div>

          {(search || statusFilter || priorityFilter || taskTypeFilter || assigneeFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPriorityFilter("");
                setTaskTypeFilter("");
                setAssigneeFilter("");
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
              className="text-red-600 hover:underline font-bold"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Task Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Đang tải dữ liệu công việc...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Không tìm thấy công việc nào phù hợp</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider">
                  <th className="p-3.5">Mã CV</th>
                  <th className="p-3.5">Tên công việc</th>
                  <th className="p-3.5">Lĩnh vực</th>
                  <th className="p-3.5">Người làm</th>
                  <th className="p-3.5">Hạn hoàn thành</th>
                  <th className="p-3.5">Loại</th>
                  <th className="p-3.5">Ưu tiên</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task) => {
                  const isOverdue =
                    task.status !== "COMPLETED" && task.status !== "CANCELLED" && new Date(task.deadline) < new Date();

                  return (
                    <tr key={task.id} className="hover:bg-blue-50/40 transition">
                      <td className="p-3.5 font-mono font-bold text-gray-900">{task.code}</td>
                      <td className="p-3.5 max-w-xs">
                        <div className="font-semibold text-gray-900 truncate">{task.title}</div>
                        {task.unit && (
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                            <span className="bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded font-bold">
                              {task.unit}
                            </span>
                            <span className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                              ĐC: {task.benchmarkScore}đ
                            </span>
                            <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                              {task.complexityLevel} (x{task.conversionFactor})
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-gray-600">{task.field}</td>
                      <td className="p-3.5 font-medium text-gray-800">{task.assignee.fullName}</td>
                      <td className="p-3.5">
                        <span className={`font-semibold ${isOverdue ? "text-red-600 font-bold" : "text-gray-700"}`}>
                          {formatDate(task.deadline)}
                        </span>
                        {isOverdue && (
                          <span className="block text-[10px] text-red-600 font-bold uppercase">Quá hạn</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            task.taskType === "AD_HOC"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-teal-100 text-teal-800"
                          }`}
                        >
                          {formatTaskType(task.taskType)}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            task.priority === "HIGH"
                              ? "bg-red-100 text-red-800"
                              : task.priority === "MEDIUM"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {formatPriority(task.priority)}
                        </span>
                      </td>
                      <td className="p-3.5 space-y-1">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            task.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : task.status === "IN_PROGRESS"
                              ? "bg-blue-100 text-blue-800"
                              : task.status === "PAUSED"
                              ? "bg-gray-100 text-gray-800"
                              : task.status === "CANCELLED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {formatStatus(task.status)}
                        </span>
                        {task.assignedScore !== null && task.assignedScore !== undefined && (
                          <div className="block">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-900 border border-teal-200">
                              <Star className="w-3 h-3 text-teal-600" /> Điểm: {task.completedScore ?? 0}/{task.assignedScore} ({task.completionRate ?? 0}%)
                            </span>
                          </div>
                        )}
                        {task.status === "COMPLETED" && (
                          <div className="block">
                            {task.kpiScore !== null && task.kpiScore !== undefined ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                                <Award className="w-3 h-3" /> KPI: {task.kpiScore}%
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Chờ chấm KPI
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-right space-x-1">
                        {task.status === "COMPLETED" && currentUser?.role === "ADMIN" && currentUser?.id !== task.assigneeId && (
                          <button
                            onClick={() => openKpiModal(task)}
                            className="p-1.5 text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition"
                            title={task.kpiScore !== null && task.kpiScore !== undefined ? "Sửa điểm KPI" : "Chấm điểm KPI"}
                          >
                            <Award className="w-3.5 h-3.5" />
                            {task.kpiScore !== null && task.kpiScore !== undefined ? "Sửa KPI" : "Chấm KPI"}
                          </button>
                        )}
                        <button
                          onClick={() => setViewingTask(task)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(task)}
                          className="p-1.5 text-gray-500 hover:text-emerald-600 rounded-lg hover:bg-gray-100"
                          title="Chỉnh sửa / Cập nhật"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {currentUser?.role === "ADMIN" && (
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-600">Hiển thị:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2.5 py-1 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
            >
              <option value={10}>10 công việc/trang</option>
              <option value={50}>50 công việc/trang</option>
              <option value={100}>100 công việc/trang</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Trang <strong className="text-gray-900">{total > 0 ? page : 0}</strong> / <strong className="text-gray-900">{totalPages}</strong> (Tổng số <strong className="text-gray-900">{total}</strong> công việc)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="p-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition shadow-sm"
                title="Trang trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="p-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition shadow-sm"
                title="Trang sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal View Details */}
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
                <p className="text-gray-400 font-semibold">Loại công việc:</p>
                <p className="font-bold text-gray-800">{formatTaskType(viewingTask.taskType)}</p>
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
                <div className="p-3 bg-gray-50 rounded-xl text-gray-800 mt-1 min-h-[60px] whitespace-pre-wrap">
                  {viewingTask.result || "Chưa có kết quả"}
                </div>
              </div>
              <div>
                <p className="text-gray-500 font-bold">Ghi chú:</p>
                <div className="p-3 bg-gray-50 rounded-xl text-gray-800 mt-1 min-h-[50px] whitespace-pre-wrap">
                  {viewingTask.notes || "Không có ghi chú"}
                </div>
              </div>
            </div>

            {viewingTask.unit && (
              <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-teal-200/60 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-teal-900 text-sm">
                    <Star className="w-4 h-4 text-teal-700" /> Định Mức Công Việc Chuẩn & Điểm Đạt Được
                  </div>
                  {viewingTask.completionRate !== null && viewingTask.completionRate !== undefined && (
                    <span className="px-2.5 py-1 bg-teal-700 text-white font-black rounded-lg text-xs">
                      TỶ LỆ: {viewingTask.completionRate}%
                    </span>
                  )}
                </div>

                {viewingTask.position && (
                  <div className="text-[11px] text-teal-950 font-medium">
                    <span><strong>Vị trí:</strong> {viewingTask.position.name}</span>
                    {viewingTask.group && <span className="ml-3"><strong>Nhóm:</strong> {viewingTask.group.name}</span>}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded-xl border border-teal-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">ĐVT</span>
                    <span className="text-xs font-black text-teal-950">{viewingTask.unit || "-"}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-teal-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">Điểm chuẩn</span>
                    <span className="text-xs font-black text-teal-950">{viewingTask.benchmarkScore ?? "-"}đ</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-teal-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">Mức độ</span>
                    <span className="text-xs font-black text-teal-950">{viewingTask.complexityLevel || "-"}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-teal-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">Hệ số (k)</span>
                    <span className="text-xs font-black text-teal-950">x{viewingTask.conversionFactor ?? 1}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-xl border border-teal-100 shadow-sm text-left">
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase">
                      <span>Giao việc</span>
                      <span className="text-teal-700 font-black">KL: {viewingTask.assignedVolume ?? "-"}</span>
                    </div>
                    <div className="text-sm font-black text-teal-950 mt-1">
                      Điểm giao: {viewingTask.assignedScore !== null && viewingTask.assignedScore !== undefined ? `${viewingTask.assignedScore} điểm` : "Chưa tính"}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-teal-100 shadow-sm text-left">
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase">
                      <span>Thực hiện</span>
                      <span className="text-emerald-700 font-black">KL: {viewingTask.completedVolume ?? "-"}</span>
                    </div>
                    <div className="text-sm font-black text-emerald-800 mt-1">
                      Điểm đạt: {viewingTask.completedScore !== null && viewingTask.completedScore !== undefined ? `${viewingTask.completedScore} điểm` : "Chưa có"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {viewingTask.kpiScore !== null && viewingTask.kpiScore !== undefined && (
              <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
                  <div className="flex items-center gap-1.5 font-black text-purple-900 text-sm">
                    <Award className="w-4 h-4 text-purple-700" /> Kết Quả Chấm Điểm KPI
                  </div>
                  <span className="px-2.5 py-1 bg-purple-600 text-white font-black rounded-lg text-xs">
                    KPI TỔNG: {viewingTask.kpiScore}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded-xl border border-purple-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">1. Số lượng</span>
                    <span className="text-base font-black text-purple-900">{viewingTask.kpiQuantity}</span>
                    <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-purple-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">2. Tiến độ</span>
                    <span className="text-base font-black text-purple-900">{viewingTask.kpiProgress}</span>
                    <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-purple-100 shadow-sm">
                    <span className="text-[10px] text-gray-500 font-bold block uppercase">3. Chất lượng</span>
                    <span className="text-base font-black text-purple-900">{viewingTask.kpiQuality}</span>
                    <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                  </div>
                </div>

                <div className="pt-1 text-gray-700 space-y-1">
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-purple-950 font-medium gap-1">
                    <span><strong>Người đánh giá:</strong> {viewingTask.kpiEvaluator?.fullName || "Admin"}</span>
                    <span><strong>Thời điểm:</strong> {formatDate(viewingTask.kpiEvaluatedAt)}</span>
                  </div>
                  {viewingTask.kpiComment && (
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100 mt-1 italic text-gray-800 text-xs">
                      "{viewingTask.kpiComment}"
                    </div>
                  )}
                </div>
              </div>
            )}
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

      {/* Modal Create / Edit Task */}
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
              {editingTask
                ? currentUser?.role === "ADMIN"
                  ? "Chỉnh Sửa Công Việc"
                  : "Cập Nhật Kết Quả Công Việc"
                : "Tạo Công Việc Mới"}
            </h3>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl">{formError}</div>
            )}

            <form onSubmit={handleSaveTask} className="space-y-4 text-xs">
              {currentUser?.role === "ADMIN" && (
                <>
                  {/* Standard Task Catalog Selection */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200/80 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="font-black text-blue-900 text-xs flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-blue-700" /> Chuẩn Hóa Chức Danh & Công Việc Chuẩn
                      </label>
                      {formData.standardTaskId && (
                        <button
                          type="button"
                          onClick={() => handleStandardTaskChange("")}
                          className="text-[11px] text-blue-600 hover:text-blue-800 underline font-bold"
                        >
                          Xóa chọn công việc chuẩn
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">1. Vị trí việc làm</label>
                        <select
                          value={formData.positionId}
                          onChange={(e) => {
                            const newPosId = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              positionId: newPosId,
                              groupId: "",
                              standardTaskId: "",
                              unit: "",
                              benchmarkScore: "",
                              complexityLevel: "",
                              conversionFactor: "",
                            }));
                          }}
                          className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs"
                        >
                          <option value="">-- Chọn vị trí việc làm --</option>
                          {positions.map((pos) => (
                            <option key={pos.id} value={pos.id}>
                              {pos.name} ({pos.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">2. Chọn công việc chuẩn</label>
                        <select
                          value={formData.standardTaskId}
                          onChange={(e) => handleStandardTaskChange(e.target.value)}
                          className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs font-medium"
                        >
                          <option value="">-- Tùy chỉnh (Không chọn chuẩn) --</option>
                          {standardTasks
                            .filter((st) => !formData.positionId || st.positionId === formData.positionId)
                            .map((st) => (
                              <option key={st.id} value={st.id}>
                                [{st.code}] {st.name} ({st.unit} - {st.complexityLevel} - {st.benchmarkScore}đ)
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {/* Auto-filled Standard Task Info Card */}
                    {formData.unit && (
                      <div className="p-3 bg-white/90 border border-blue-100 rounded-xl space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between text-[11px] font-black text-blue-900 border-b border-blue-50 pb-1.5">
                          <span>✨ THÔNG TIN TỰ ĐỘNG TỪ DANH MỤC CHUẨN</span>
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                            Tự động điền & Khóa chuẩn
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-bold block uppercase">ĐVT</span>
                            <span className="text-xs font-black text-gray-900">{formData.unit}</span>
                          </div>
                          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-bold block uppercase">Điểm chuẩn</span>
                            <span className="text-xs font-black text-blue-700">{formData.benchmarkScore}đ</span>
                          </div>
                          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-bold block uppercase">Mức độ</span>
                            <span className="text-xs font-black text-indigo-700">{formData.complexityLevel}</span>
                          </div>
                          <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100">
                            <span className="text-[10px] text-gray-500 font-bold block uppercase">Hệ số quy đổi</span>
                            <span className="text-xs font-black text-emerald-700">x{formData.conversionFactor}</span>
                          </div>
                        </div>

                        {/* Assigned Volume and Live Assigned Score */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-50">
                          <div className="flex items-center gap-2">
                            <label className="font-bold text-gray-700">Khối lượng giao:</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={formData.assignedVolume}
                              onChange={(e) => setFormData({ ...formData, assignedVolume: e.target.value })}
                              placeholder="VD: 1, 2, 5..."
                              className="w-24 p-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-center"
                            />
                            <span className="text-gray-500 font-semibold">{formData.unit}</span>
                          </div>
                          {computedAssignedScore !== null && (
                            <div className="text-xs font-black text-blue-900 bg-blue-100/70 px-2.5 py-1 rounded-lg">
                              Điểm giao: <span className="text-blue-700 text-sm">{computedAssignedScore}</span> điểm
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1">Mã công việc *</label>
                      <input
                        type="text"
                        required
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
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
                        required
                        value={formData.assigneeId}
                        onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                      >
                        <option value="">-- Chọn người làm --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-gray-700 mb-1">Hạn hoàn thành *</label>
                      <input
                        type="datetime-local"
                        required
                        value={formData.deadline}
                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Loại công việc</label>
                    <select
                      value={formData.taskType}
                      onChange={(e) => setFormData({ ...formData, taskType: e.target.value as any })}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                    >
                      <option value="RECURRING">Thường xuyên</option>
                      <option value="AD_HOC">Đột xuất</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Mức độ ưu tiên</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                    >
                      <option value="LOW">Bình thường</option>
                      <option value="MEDIUM">Gấp</option>
                      <option value="HIGH">Rất gấp</option>
                    </select>
                  </div>
                </>
              )}

              {/* Completed Volume Input & Live Score Calculation (Available when standard task is set) */}
              {formData.unit && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-black text-emerald-950">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Báo Cáo Khối Lượng Hoàn Thành
                    </span>
                    {computedCompletionRate !== null && (
                      <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                        Đạt {computedCompletionRate}%
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="font-bold text-gray-700">Khối lượng thực hiện:</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={formData.completedVolume}
                        onChange={(e) => setFormData({ ...formData, completedVolume: e.target.value })}
                        placeholder="VD: 1, 2..."
                        className="w-24 p-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-center"
                      />
                      <span className="text-gray-500 font-semibold">{formData.unit}</span>
                    </div>

                    {computedCompletedScore !== null && (
                      <div className="text-xs font-black text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-lg">
                        Điểm thực hiện: <span className="text-emerald-700 text-sm">{computedCompletedScore}</span> điểm
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Status, Result, Notes (Editable by both Admin & User) */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Trạng thái công việc</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                >
                  <option value="TODO">Chưa thực hiện</option>
                  <option value="IN_PROGRESS">Đang thực hiện</option>
                  <option value="PAUSED">Tạm dừng</option>
                  <option value="COMPLETED">Hoàn thành</option>
                  <option value="CANCELLED">Hủy</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Kết quả thực hiện</label>
                <textarea
                  rows={3}
                  placeholder="Cập nhật kết quả chi tiết..."
                  value={formData.result}
                  onChange={(e) => setFormData({ ...formData, result: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú bổ sung..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingTask(null);
                  }}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu Công Việc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => {
                setIsImportModalOpen(false);
                setImportFile(null);
                setImportResult(null);
                setImportError("");
              }}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Import Công Việc Từ File Excel</h3>
                <p className="text-xs text-gray-500">Tải lên file danh sách công việc hàng loạt (.xlsx, .xls)</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
              <span className="font-bold block">💡 Hướng dẫn Import:</span>
              <p>Hệ thống tự động nhận diện các cột: Mã, Tiêu đề, Lĩnh vực, Người thực hiện, Hạn hoàn thành, Độ ưu tiên, Trạng thái, Ghi chú.</p>
              <a
                href="/api/tasks/template"
                download="Mau_Import_Cong_Viec.xlsx"
                className="inline-flex items-center gap-1.5 font-bold text-blue-600 hover:underline pt-1"
              >
                <Download className="w-3.5 h-3.5" /> Tải File Excel Mẫu Chuẩn (.xlsx)
              </a>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" /> {importResult.message}
                </div>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 space-y-0.5 max-h-32 overflow-y-auto">
                    <span className="font-bold">Chi tiết cảnh báo/bỏ qua ({importResult.errors.length}):</span>
                    {importResult.errors.map((errStr, idx) => (
                      <div key={idx}>• {errStr}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleImportExcel} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Chọn File Excel từ máy tính *</label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {importing ? "Đang xử lý..." : "Tiến Hành Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KPI Scoring Modal */}
      {kpiModalTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setKpiModalTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-purple-100 rounded-xl text-purple-700">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">CHẤM ĐIỂM KPI CÔNG VIỆC</h3>
                <p className="text-xs text-gray-500">Đánh giá 3 tiêu chí hoàn thành công việc</p>
              </div>
            </div>

            <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl space-y-1 text-xs text-purple-950">
              <p><strong>Công việc:</strong> <span className="font-mono font-bold">[{kpiModalTask.code}]</span> {kpiModalTask.title}</p>
              <p><strong>Người thực hiện:</strong> {kpiModalTask.assignee.fullName}</p>
              <p><strong>Hạn hoàn thành:</strong> {formatDate(kpiModalTask.deadline)}</p>
            </div>

            {kpiFormError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {kpiFormError}
              </div>
            )}

            <form onSubmit={handleSaveKpi} className="space-y-4 text-xs">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-800 uppercase text-[11px]">1. SỐ LƯỢNG (0 — 100)</label>
                    <span className="font-mono font-bold text-blue-600 text-xs">{kpiFormData.kpiQuantity || 0}/100</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    required
                    value={kpiFormData.kpiQuantity}
                    onChange={(e) => setKpiFormData({ ...kpiFormData, kpiQuantity: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm"
                    placeholder="Điểm số lượng (0 - 100)"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Mức độ hoàn thành khối lượng/sản lượng công việc</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-800 uppercase text-[11px]">2. TIẾN ĐỘ (0 — 100)</label>
                    <span className="font-mono font-bold text-blue-600 text-xs">{kpiFormData.kpiProgress || 0}/100</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    required
                    value={kpiFormData.kpiProgress}
                    onChange={(e) => setKpiFormData({ ...kpiFormData, kpiProgress: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm"
                    placeholder="Điểm tiến độ (0 - 100)"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Mức độ hoàn thành công việc đúng thời hạn</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-800 uppercase text-[11px]">3. CHẤT LƯỢNG (0 — 100)</label>
                    <span className="font-mono font-bold text-blue-600 text-xs">{kpiFormData.kpiQuality || 0}/100</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    required
                    value={kpiFormData.kpiQuality}
                    onChange={(e) => setKpiFormData({ ...kpiFormData, kpiQuality: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm"
                    placeholder="Điểm chất lượng (0 - 100)"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Mức độ đáp ứng yêu cầu và kết quả đầu ra</p>
                </div>
              </div>

              <div className="p-3 bg-purple-100/70 border border-purple-200 rounded-xl flex items-center justify-between">
                <span className="font-black text-purple-950 uppercase text-xs">KPI TỔNG:</span>
                <span className="font-black text-purple-900 text-lg">
                  {(() => {
                    const q = parseFloat(kpiFormData.kpiQuantity);
                    const p = parseFloat(kpiFormData.kpiProgress);
                    const l = parseFloat(kpiFormData.kpiQuality);
                    if (!isNaN(q) && q >= 0 && q <= 100 && !isNaN(p) && p >= 0 && p <= 100 && !isNaN(l) && l >= 0 && l <= 100) {
                      return `${Number(((q + p + l) / 3).toFixed(2))}%`;
                    }
                    return "--%";
                  })()}
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nhận xét:</label>
                <textarea
                  rows={3}
                  value={kpiFormData.kpiComment}
                  onChange={(e) => setKpiFormData({ ...kpiFormData, kpiComment: e.target.value })}
                  placeholder="Nhập nhận xét / đánh giá bổ sung (nếu có)..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setKpiModalTask(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingKpi}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Award className="w-4 h-4" />
                  {isSubmittingKpi ? "Đang lưu..." : "Lưu đánh giá"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
