"use client";

import { useState, useEffect } from "react";
import { Plus, User, Shield, Lock, Unlock, Key, Edit, X } from "lucide-react";

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "LOCKED";
  createdAt: string;
  _count?: { tasks: number };
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    password: "",
    role: "USER" as "ADMIN" | "USER",
    status: "ACTIVE" as "ACTIVE" | "LOCKED",
  });

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      email: "",
      fullName: "",
      password: "",
      role: "USER",
      status: "ACTIVE",
    });
    setError("");
    setIsModalOpen(true);
  };

  const openEditModal = (u: UserItem) => {
    setEditingUser(u);
    setFormData({
      email: u.email,
      fullName: u.fullName,
      password: "",
      role: u.role,
      status: u.status,
    });
    setError("");
    setIsModalOpen(true);
  };

  const handleToggleLock = async (u: UserItem) => {
    const newStatus = u.status === "ACTIVE" ? "LOCKED" : "ACTIVE";
    const confirmMsg =
      newStatus === "LOCKED"
        ? `Bạn có chắc muốn KHÓA tài khoản ${u.email}?`
        : `Bạn có chắc muốn MỞ KHÓA tài khoản ${u.email}?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) loadUsers();
    } catch (e) {
      alert("Lỗi thao tác");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (editingUser) {
        // PATCH
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: formData.fullName,
            role: formData.role,
            status: formData.status,
            ...(formData.password && { password: formData.password }),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi cập nhật");
      } else {
        // POST
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi tạo tài khoản");
      }

      setIsModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Quản Lý Nhân Sự & Tài Khoản</h1>
          <p className="text-sm text-gray-500">Phân quyền, quản lý trạng thái tài khoản và đổi mật khẩu</p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
        >
          <Plus className="w-4 h-4" /> Tạo Tài Khoản Mới
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Đang tải danh sách nhân sự...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider">
                  <th className="p-3.5">Họ và tên</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Vai trò</th>
                  <th className="p-3.5">Số lượng việc</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition">
                    <td className="p-3.5 font-bold text-gray-900">{u.fullName}</td>
                    <td className="p-3.5 font-mono text-gray-700">{u.email}</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          u.role === "ADMIN" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-gray-700">{u._count?.tasks || 0} công việc</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.status === "ACTIVE" ? "Hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-1">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100"
                        title="Sửa / Đổi mật khẩu"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleLock(u)}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 ${
                          u.status === "ACTIVE" ? "text-red-500 hover:text-red-700" : "text-emerald-600 hover:text-emerald-800"
                        }`}
                        title={u.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      >
                        {u.status === "ACTIVE" ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900">
              {editingUser ? `Chỉnh Sửa Tài Khoản: ${editingUser.email}` : "Tạo Tài Khoản Nhân Sự Mới"}
            </h3>

            {error && <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {!editingUser && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Mật khẩu {editingUser ? "(Bỏ trống nếu không muốn đổi)" : "*"}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Phân quyền</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    <option value="USER">User (Nhân viên)</option>
                    <option value="ADMIN">Admin (Quản trị)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Trạng thái</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    <option value="ACTIVE">Hoạt động</option>
                    <option value="LOCKED">Khóa</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Đang xử lý..." : "Lưu Tài Khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
