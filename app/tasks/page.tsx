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
} from "lucide-react";
import { formatDate, formatPriority, formatStatus } from "@/lib/utils";

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
  const [currentUser, setCurrentUser] = useState<{ id: string; role: "ADMIN" | "USER" } | null>(null);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter states
  const [search, setSearch] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [viewingTask, setViewingTask] = useState<TaskItem | null>(null);

  // Form states
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

  // Fetch current user details
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
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "10");

      const paramId = searchParams.get("id");
      if (paramId) params.set("id", paramId);

      if (search) params.set("search", search);
      if (fieldFilter) params.set("field", fieldFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (assigneeFilter) params.set("assigneeId", assigneeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
        setTotalPages(data.pagination.totalPages || 1);
        setTotal(data.pagination.total || 0);

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
  }, [page, search, fieldFilter, statusFilter, priorityFilter, assigneeFilter, startDate, endDate, searchParams]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const openCreateModal = () => {
    setFormData({
      code: `TASK-${Math.floor(100 + Math.random() * 900)}`,
      title: "",
      field: "Công nghệ thông tin",
      assigneeId: users[0]?.id || "",
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      priority: "LOW",
      status: "TODO",
      result: "",
      notes: "",
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
      status: task.status,
      result: task.result || "",
      notes: task.notes || "",
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Quản Lý Công Việc</h1>
          <p className="text-sm text-gray-500">Danh sách công việc & bộ lọc tìm kiếm nâng cao (Tổng: {total})</p>
        </div>

        {currentUser?.role === "ADMIN" && (
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
          >
            <Plus className="w-4 h-4" /> Tạo Công Việc Mới
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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

          {(search || statusFilter || priorityFilter || assigneeFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPriorityFilter("");
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
                      <td className="p-3.5 font-semibold text-gray-900 max-w-xs truncate">{task.title}</td>
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
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
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
                      </td>
                      <td className="p-3.5 text-right space-x-1">
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
        <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50">
          <span>
            Trang {page} / {totalPages} (Tổng số {total} công việc)
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="p-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="p-1.5 bg-white border border-gray-200 rounded-lg disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
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
    </div>
  );
}
