"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Lock, Unlock, Edit, X, Search, Building2, Briefcase } from "lucide-react";
import { Role } from "@prisma/client";
import { formatWorkLocation } from "@/lib/utils";
import {
  ROLE_LABELS,
  ROLE_SHORT_LABELS,
  ROLE_BADGE_CLASSES,
  DEPARTMENTS,
  Department,
  DEPARTMENT_BADGE_CLASSES,
} from "@/lib/permissions";

interface UserItem {
  id: string;
  email: string;
  fullName: string;
  zaloId?: string | null;
  staffCode?: string | null;
  positionId?: string | null;
  position?: {
    id: string;
    code: string;
    name: string;
    careerRank?: string | null;
  } | null;
  qualification?: string | null;
  department?: string | null;
  workLocation?: string | null;
  concurrentHours?: number | null;
  role: Role;
  status: "ACTIVE" | "LOCKED";
  createdAt: string;
  _count?: { tasks: number };
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    password: "",
    zaloId: "",
    staffCode: "",
    positionId: "",
    qualification: "",
    department: "Khám bệnh",
    workLocation: "Trạm chính",
    concurrentHours: "120",
    role: "USER" as Role,
    status: "ACTIVE" as "ACTIVE" | "LOCKED",
  });

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/job-positions"),
      ]);
      if (uRes.ok) {
        const data = await uRes.json();
        setUsers(data.users || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        if (Array.isArray(pData)) setPositions(pData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (departmentFilter && (u.department || "Khám bệnh") !== departmentFilter) return false;
      if (locationFilter && (u.workLocation || "Trạm chính") !== locationFilter) return false;
      if (positionFilter && u.positionId !== positionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.staffCode || "").toLowerCase().includes(q) ||
          (u.qualification || "").toLowerCase().includes(q) ||
          (u.department || "").toLowerCase().includes(q) ||
          (u.position?.code || "").toLowerCase().includes(q) ||
          (u.position?.name || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, departmentFilter, locationFilter, positionFilter, search]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      email: "",
      fullName: "",
      password: "",
      zaloId: "",
      staffCode: `VC-TYT-${users.length + 1}`,
      positionId: positions[0]?.id || "",
      qualification: "",
      department: "Khám bệnh",
      workLocation: "Trạm chính",
      concurrentHours: "120",
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
      zaloId: u.zaloId || "",
      staffCode: u.staffCode || "",
      positionId: u.positionId || "",
      qualification: u.qualification || "",
      department: u.department || "Khám bệnh",
      workLocation: u.workLocation || "Trạm chính",
      concurrentHours: String(u.concurrentHours ?? 120),
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
      if (res.ok) loadData();
    } catch (e) {
      alert("Lỗi thao tác");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = {
        email: formData.email,
        fullName: formData.fullName,
        role: formData.role,
        status: formData.status,
        zaloId: formData.zaloId,
        staffCode: formData.staffCode,
        positionId: formData.positionId || null,
        qualification: formData.qualification,
        department: formData.department,
        workLocation: formData.workLocation,
        concurrentHours: Number(formData.concurrentHours) || 120,
        ...(formData.password && { password: formData.password }),
      };

      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi cập nhật");
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, password: formData.password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Lỗi khi tạo tài khoản");
      }

      setIsModalOpen(false);
      loadData();
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
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Quản Lý Nhân Sự &amp; Vị Trí Việc Làm ({users.length} Viên chức)
          </h1>
          <p className="text-sm text-gray-500">
            Danh sách viên chức Trạm Y tế Cái Bầu theo Biểu D1 (HD 07-BTCTW) &amp; Bậc nghề nghiệp Nghị định 232/2026/NĐ-CP
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Thêm Viên Chức / Tài Khoản
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm họ tên, mã VC (VC-10...), trình độ, VTVL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none font-medium"
        >
          <option value="">-- Tất cả 5 bộ phận --</option>
          {DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>
              Bộ phận {dept}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none"
        >
          <option value="">-- Tất cả điểm công tác --</option>
          <option value="Trạm chính">Trạm chính</option>
          <option value="Cơ sở Methadone">Cơ sở Methadone</option>
          <option value="Điểm trạm 1">Điểm trạm 1 (Đoàn Kết)</option>
          <option value="Điểm trạm 2">Điểm trạm 2 (Hạ Long)</option>
          <option value="Điểm trạm 3">Điểm trạm 3 (Đài Xuyên)</option>
          <option value="Điểm trạm 4">Điểm trạm 4 (Vạn Yên)</option>
        </select>

        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none"
        >
          <option value="">-- Tất cả Vị trí việc làm (19 VTVL) --</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">Đang tải danh sách viên chức Trạm Y tế Cái Bầu...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider">
                  <th className="p-3.5">Mã VC (D1)</th>
                  <th className="p-3.5">Họ và tên / Email</th>
                  <th className="p-3.5">VTVL &amp; Bậc nghề nghiệp (NĐ 232)</th>
                  <th className="p-3.5">Trình độ &amp; Mã ngạch</th>
                  <th className="p-3.5">Bộ phận</th>
                  <th className="p-3.5">Điểm công tác</th>
                  <th className="p-3.5 text-center">Quỹ giờ (Chính / KN)</th>
                  <th className="p-3.5 text-center">Công việc</th>
                  <th className="p-3.5 text-center">Trạng thái</th>
                  <th className="p-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((u) => {
                  const knHours = u.concurrentHours ?? 120;
                  const mainHours = 1904 - knHours;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition">
                      <td className="p-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {u.staffCode || "—"}
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          {u.fullName}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              ROLE_BADGE_CLASSES[u.role] || "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {ROLE_SHORT_LABELS[u.role] || u.role}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-gray-500">{u.email}</div>
                      </td>
                      <td className="p-3.5">
                        {u.position ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-mono font-bold text-[11px]">
                              <Briefcase className="w-3 h-3" /> {u.position.code}
                            </span>
                            <div className="font-semibold text-gray-800 mt-0.5">{u.position.name}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Chưa gán VTVL</span>
                        )}
                      </td>
                      <td className="p-3.5 text-gray-700 font-medium">{u.qualification || "—"}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                            DEPARTMENT_BADGE_CLASSES[u.department || "Khám bệnh"] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {u.department || "Khám bệnh"}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold text-[11px]">
                          <Building2 className="w-3 h-3 text-gray-500" />
                          {formatWorkLocation(u.workLocation)}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono">
                        <span className="font-bold text-blue-700">{mainHours}h</span> /{" "}
                        <span className="text-amber-700 font-semibold">{knHours}h</span>
                      </td>
                      <td className="p-3.5 text-center font-semibold text-gray-700">
                        {u._count?.tasks || 0} việc
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }`}
                        >
                          {u.status === "ACTIVE" ? "Hoạt động" : "Đã khóa"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100 cursor-pointer"
                          title="Sửa hồ sơ VTVL / Đổi mật khẩu"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleLock(u)}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer ${
                            u.status === "ACTIVE"
                              ? "text-red-500 hover:text-red-700"
                              : "text-emerald-600 hover:text-emerald-800"
                          }`}
                          title={u.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                        >
                          {u.status === "ACTIVE" ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative my-8">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900">
              {editingUser ? `Cập nhật Viên chức: ${editingUser.fullName}` : "Thêm Viên Chức Mới (Biểu D1)"}
            </h3>

            {error && <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Mã nguồn lực (Biểu D1)</label>
                  <input
                    type="text"
                    placeholder="VD: VC-10.2669"
                    value={formData.staffCode}
                    onChange={(e) => setFormData({ ...formData, staffCode: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Họ và tên viên chức *</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Vị trí việc làm &amp; Bậc nghề nghiệp (Biểu C1 / NĐ 232)
                </label>
                <select
                  value={formData.positionId}
                  onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                  className="w-full p-2.5 bg-blue-50/50 border border-blue-200 rounded-xl font-semibold text-gray-900"
                >
                  <option value="">-- Chọn Vị trí việc làm (19 VTVL) --</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Trình độ &amp; Mã ngạch hiện hưởng</label>
                  <input
                    type="text"
                    placeholder="VD: Bác sĩ Đa khoa (V.08.01.03)"
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Bộ phận công tác *</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full p-2.5 bg-blue-50/40 border border-blue-200 rounded-xl font-bold text-blue-900"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        Bộ phận {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Điểm công tác</label>
                  <select
                    value={formData.workLocation}
                    onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    <option value="Trạm chính">Trạm chính</option>
                    <option value="Cơ sở Methadone">Cơ sở Methadone</option>
                    <option value="Điểm trạm 1">Điểm trạm 1 (Đoàn Kết)</option>
                    <option value="Điểm trạm 2">Điểm trạm 2 (Hạ Long)</option>
                    <option value="Điểm trạm 3">Điểm trạm 3 (Đài Xuyên)</option>
                    <option value="Điểm trạm 4">Điểm trạm 4 (Vạn Yên)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Email đăng nhập *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Giờ kiêm nhiệm Đảng/Đoàn thể (trên 1.904h)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1904"
                    value={formData.concurrentHours}
                    onChange={(e) => setFormData({ ...formData, concurrentHours: e.target.value })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Zalo ID (user_id OA) <span className="font-normal text-gray-400">(tùy chọn)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.zaloId}
                    onChange={(e) => setFormData({ ...formData, zaloId: e.target.value })}
                    placeholder="Ví dụ: 1234567890"
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Mật khẩu {editingUser ? "(Bỏ trống nếu giữ nguyên)" : "*"}
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Phân quyền hệ thống</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    <option value="ADMIN">1: Admin (Quản trị hệ thống)</option>
                    <option value="DIRECTOR">2: Giám đốc</option>
                    <option value="DEPUTY_DIRECTOR">3: Phó Giám đốc</option>
                    <option value="DEPARTMENT_HEAD">4: Phụ trách bộ phận</option>
                    <option value="USER">5: Viên chức</option>
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
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Đang lưu..." : "Lưu Hồ Sơ Viên Chức"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
