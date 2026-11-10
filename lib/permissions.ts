import { Role } from "@prisma/client";

export type UserRole = Role;

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin (Quản trị hệ thống)",
  DIRECTOR: "Giám đốc",
  DEPUTY_DIRECTOR: "Phó Giám đốc",
  DEPARTMENT_HEAD: "Phụ trách bộ phận",
  USER: "Viên chức",
};

export const ROLE_SHORT_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  DIRECTOR: "Giám đốc",
  DEPUTY_DIRECTOR: "Phó Giám đốc",
  DEPARTMENT_HEAD: "Phụ trách BP",
  USER: "Viên chức",
};

export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  ADMIN: "bg-red-100 text-red-800 border border-red-200",
  DIRECTOR: "bg-purple-100 text-purple-800 border border-purple-200",
  DEPUTY_DIRECTOR: "bg-indigo-100 text-indigo-800 border border-indigo-200",
  DEPARTMENT_HEAD: "bg-teal-100 text-teal-800 border border-teal-200",
  USER: "bg-emerald-100 text-emerald-800 border border-emerald-200",
};

// 5 Bộ phận căn cứ chức năng nhiệm vụ của Trạm Y tế
export const DEPARTMENTS = [
  "Khám bệnh",
  "Văn phòng",
  "Dân số",
  "Phòng bệnh",
  "Dược",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_BADGE_CLASSES: Record<string, string> = {
  "Khám bệnh": "bg-blue-50 text-blue-700 border-blue-200",
  "Văn phòng": "bg-slate-100 text-slate-700 border-slate-300",
  "Dân số": "bg-amber-50 text-amber-700 border-amber-200",
  "Phòng bệnh": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Dược": "bg-cyan-50 text-cyan-700 border-cyan-200",
};

// 1. Quản trị hệ thống (Chỉ ADMIN): Quản lý tài khoản, cấu hình danh mục, reset seed
export const isSystemAdmin = (role?: string | null): boolean => {
  return role === "ADMIN";
};

// 2. Ban Giám đốc (Admin, Giám đốc, Phó Giám đốc): Quản lý toàn diện đơn vị
export const isExecutive = (role?: string | null): boolean => {
  return role === "ADMIN" || role === "DIRECTOR" || role === "DEPUTY_DIRECTOR";
};
export const isLeadership = isExecutive;

// 3. Cấp quản lý (Admin, Giám đốc, PGĐ, Phụ trách bộ phận): Được giao việc & chấm KPI
export const isManager = (role?: string | null): boolean => {
  return (
    role === "ADMIN" ||
    role === "DIRECTOR" ||
    role === "DEPUTY_DIRECTOR" ||
    role === "DEPARTMENT_HEAD"
  );
};

// 4. Quyền xem Đề án VTVL & Báo cáo (Admin, Giám đốc, PGĐ, Phụ trách bộ phận; Viên chức KHÔNG được xem)
export const canViewVtvlAndReports = (role?: string | null): boolean => {
  return (
    role === "ADMIN" ||
    role === "DIRECTOR" ||
    role === "DEPUTY_DIRECTOR" ||
    role === "DEPARTMENT_HEAD"
  );
};

// 5. Kiểm tra quyền chấm / điều chỉnh KPI theo quy trình 3 cấp (Cá nhân -> Phụ trách BP -> Ban Giám đốc):

// - Cấp 1: Cá nhân được giao việc tự chấm điểm KPI
export const canSelfEvaluate = (
  user?: { id: string } | null,
  task?: { assigneeId: string; status: string } | null
): boolean => {
  if (!user || !task) return false;
  return user.id === task.assigneeId && task.status === "COMPLETED";
};

// - Cấp 2: Phụ trách bộ phận duyệt / điều chỉnh điểm KPI của nhân viên thuộc bộ phận
export const canDepartmentHeadAdjustKpi = (
  user?: { id: string; role?: string | null; department?: string | null } | null,
  assignee?: { id?: string; department?: string | null } | null
): boolean => {
  if (!user || !user.role || !assignee) return false;
  if (user.role !== "DEPARTMENT_HEAD") return false;
  if (user.id === assignee.id) return false; // Không tự duyệt cho chính mình
  if (!user.department || !assignee.department) return false;
  return user.department.trim().toLowerCase() === assignee.department.trim().toLowerCase();
};

// - Cấp 3: Giám đốc, Phó Giám đốc đề nghị điều chỉnh điểm KPI khi có bằng chứng cụ thể
export const canExecutiveAdjustKpi = (
  user?: { id: string; role?: string | null } | null
): boolean => {
  if (!user || !user.role) return false;
  return isExecutive(user.role);
};

// Helper chung: Kiểm tra xem user có bất kỳ quyền chấm/điều chỉnh nào với task này không
export const canEvaluateTask = (
  evaluator?: { id: string; role?: string | null; department?: string | null; workLocation?: string | null } | null,
  assignee?: { id?: string; department?: string | null; workLocation?: string | null } | null,
  taskStatus?: string
): boolean => {
  if (!evaluator || !evaluator.role) return false;
  if (isExecutive(evaluator.role)) return true;
  if (evaluator.role === "DEPARTMENT_HEAD") {
    if (assignee?.id && assignee.id === evaluator.id) return false;
    if (!evaluator.department || !assignee?.department) return false;
    return evaluator.department.trim().toLowerCase() === assignee.department.trim().toLowerCase();
  }
  // Cho phép cá nhân tự chấm
  if (assignee?.id && assignee.id === evaluator.id) {
    return taskStatus === "COMPLETED";
  }
  return false;
};

// 6. Kiểm tra quyền giao việc cho một nhân sự:
// - Admin, Giám đốc, PGĐ: giao việc cho bất kỳ ai
// - Phụ trách bộ phận: giao việc cho nhân sự thuộc bộ phận mình (hoặc chính mình)
export const canAssignTaskTo = (
  creator?: { id: string; role?: string | null; department?: string | null; workLocation?: string | null } | null,
  target?: { id?: string; department?: string | null; workLocation?: string | null } | null
): boolean => {
  if (!creator || !creator.role) return false;
  if (isExecutive(creator.role)) return true;
  if (creator.role === "DEPARTMENT_HEAD") {
    if (target?.id && target.id === creator.id) return true;
    if (!creator.department || !target?.department) return false;
    return creator.department.trim().toLowerCase() === target.department.trim().toLowerCase();
  }
  return false;
};

// 7. Kiểm tra quyền phê duyệt nhiệm vụ đột xuất do viên chức tự tạo:
// - Ban Giám đốc (ADMIN, DIRECTOR, DEPUTY_DIRECTOR): có quyền phê duyệt toàn đơn vị
// - Cán bộ phụ trách bộ phận (DEPARTMENT_HEAD): phê duyệt cho nhân sự thuộc bộ phận mình
// - Viên chức thường KHÔNG có quyền phê duyệt; và người tạo KHÔNG được tự phê duyệt cho chính mình
export const canApproveTask = (
  user?: { id: string; role?: string | null; department?: string | null } | null,
  task?: { assigneeId?: string; assignee?: { id?: string; department?: string | null } | null; department?: string | null } | null
): boolean => {
  if (!user || !user.role || !task) return false;
  const assigneeId = task.assignee?.id || task.assigneeId;
  // Tuyệt đối không tự phê duyệt cho chính mình
  if (assigneeId && user.id === assigneeId) return false;

  if (isExecutive(user.role)) return true;

  if (user.role === "DEPARTMENT_HEAD") {
    const taskDept = task.department || task.assignee?.department;
    if (!user.department || !taskDept) return false;
    return user.department.trim().toLowerCase() === taskDept.trim().toLowerCase();
  }

  return false;
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ phê duyệt",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Từ chối",
};

export const APPROVAL_STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 border border-amber-300",
  APPROVED: "bg-emerald-50 text-emerald-800 border border-emerald-300",
  REJECTED: "bg-rose-50 text-rose-800 border border-rose-300",
};
