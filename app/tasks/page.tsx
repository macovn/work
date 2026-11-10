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
  Paperclip,
  Upload,
  FileText,
  ExternalLink,
} from "lucide-react";
import { formatDate, formatPriority, formatStatus, formatTaskType, formatApprovalStatus, toLocalInputValue } from "@/lib/utils";
import { Role } from "@prisma/client";
import {
  isExecutive,
  isManager,
  canEvaluateTask,
  canSelfEvaluate,
  canDepartmentHeadAdjustKpi,
  canExecutiveAdjustKpi,
  canApproveTask,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_CLASSES,
  ROLE_SHORT_LABELS,
  ROLE_BADGE_CLASSES,
  DEPARTMENTS,
  Department,
  DEPARTMENT_BADGE_CLASSES,
} from "@/lib/permissions";

interface EvidenceFileItem {
  name: string;
  url: string;
  size?: number;
  type?: string;
  uploadedAt?: string;
}

function parseEvidenceFiles(raw?: string | EvidenceFileItem[] | null): EvidenceFileItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isImageFile(file: EvidenceFileItem): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || file.url);
}

function getFileExtBadge(file: EvidenceFileItem): string {
  const m = (file.name || file.url).match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toUpperCase() : "FILE";
}

interface TaskItem {
  id: string;
  code: string;
  title: string;
  field: string;
  assigneeId: string;
  assignee: { id: string; fullName: string; email: string; department?: string | null; workLocation?: string | null };
  deadline: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  taskType: "RECURRING" | "AD_HOC";
  status: "TODO" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  result?: string | null;
  notes?: string | null;
  evidenceSource?: string | null;
  evidenceFiles?: string | null;
  taskSource?: string | null;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  approverId?: string | null;
  approver?: { id: string; fullName: string; email: string } | null;
  approvedAt?: string | null;
  approvalNote?: string | null;
  createdById?: string | null;
  creator?: { id: string; fullName: string; email: string } | null;

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

  // 1. KPI Cá nhân tự chấm
  selfKpiQuantity?: number | null;
  selfKpiProgress?: number | null;
  selfKpiQuality?: number | null;
  selfKpiScore?: number | null;
  selfKpiComment?: string | null;
  selfKpiEvaluatedAt?: string | null;

  // 2. KPI do Phụ trách bộ phận duyệt / điều chỉnh
  kpiQuantity?: number | null;
  kpiProgress?: number | null;
  kpiQuality?: number | null;
  kpiScore?: number | null;
  kpiEvaluatorId?: string | null;
  kpiEvaluator?: { id: string; fullName: string; email: string } | null;
  kpiEvaluatedAt?: string | null;
  kpiComment?: string | null;

  // 3. KPI do Ban Giám đốc đề nghị điều chỉnh kèm bằng chứng
  directorEvidence?: string | null;
  directorComment?: string | null;
  directorAdjusterId?: string | null;
  directorAdjuster?: { id: string; fullName: string; email: string } | null;
  directorAdjustedAt?: string | null;
}

interface UserItem {
  id: string;
  fullName: string;
  email: string;
  staffCode?: string | null;
  positionId?: string | null;
  department?: string | null;
  workLocation?: string | null;
  position?: { id: string; code: string; name: string; careerRank?: string | null } | null;
}

function extractRankNumber(...sources: (string | null | undefined)[]): number | null {
  for (const src of sources) {
    if (!src) continue;
    const mCode = src.match(/\.B([1-5])\b/i) || src.match(/\bB([1-5])\b/);
    if (mCode) return Number(mCode[1]);
    const mText = src.match(/Bậc\s*([1-5])/i);
    if (mText) return Number(mText[1]);
  }
  return null;
}

function extractSpecialtyGroup(code?: string | null): string | null {
  if (!code) return null;
  const m = code.match(/^VTVL\.232\.(\d+)\./i);
  return m ? m[1] : null;
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [standardTasks, setStandardTasks] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    fullName?: string;
    email?: string;
    role: Role;
    department?: string | null;
    workLocation?: string | null;
    positionId?: string | null;
    position?: { id: string; name: string; code: string; careerRank?: string | null } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter states
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [viewingTask, setViewingTask] = useState<TaskItem | null>(null);

  // Modal phê duyệt nhiệm vụ đột xuất
  const [approvalModalTask, setApprovalModalTask] = useState<TaskItem | null>(null);
  const [approvalModalAction, setApprovalModalAction] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [approvalModalNote, setApprovalModalNote] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

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

  // KPI Scoring modal state (3 cấp: Cá nhân -> Phụ trách BP -> Ban Giám đốc)
  const [kpiModalTask, setKpiModalTask] = useState<TaskItem | null>(null);
  const [kpiModalMode, setKpiModalMode] = useState<"SELF" | "DEPT_HEAD" | "DIRECTOR_ADJUST">("SELF");
  const [kpiFormData, setKpiFormData] = useState({
    kpiQuantity: "100",
    kpiProgress: "100",
    kpiQuality: "100",
    kpiComment: "",
    directorEvidence: "",
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
    evidenceSource: "",
    evidenceFiles: [] as EvidenceFileItem[],
    taskSource: "",
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

  const [uploadingFiles, setUploadingFiles] = useState(false);
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

  // Xác định Vị trí việc làm & Bậc nghề nghiệp yêu cầu (B1..B5) từ Vị trí việc làm hoặc ô Lĩnh vực
  const activePositionForFilter =
    positions.find((p) => p.id === formData.positionId) ||
    positions.find(
      (p) =>
        formData.field &&
        (formData.field.toLowerCase().includes(p.name.toLowerCase()) ||
          formData.field.toLowerCase().includes(p.code.toLowerCase()))
    ) ||
    null;

  const requiredRank = extractRankNumber(
    activePositionForFilter?.code,
    activePositionForFilter?.name,
    activePositionForFilter?.careerRank,
    formData.field
  );
  const requiredSpecialty = extractSpecialtyGroup(activePositionForFilter?.code);

  // Lọc danh sách Người thực hiện: chỉ hiển thị viên chức có Bậc nghề nghiệp >= Bậc của Lĩnh vực/VTVL đang chọn
  // Đồng thời nếu là Phụ trách bộ phận: CHỈ hiển thị nhân sự thuộc bộ phận mình hoặc chính mình
  const eligibleUsers = users
    .filter((u) => {
      if (currentUser?.role === "DEPARTMENT_HEAD" && currentUser.department) {
        const sameDept =
          u.department && u.department.trim().toLowerCase() === currentUser.department.trim().toLowerCase();
        if (!sameDept && u.id !== currentUser.id) return false;
      }
      const userRank = extractRankNumber(u.position?.code, u.position?.name, u.position?.careerRank);
      if (requiredRank !== null) {
        return userRank !== null && userRank >= requiredRank;
      }
      return Boolean(u.position);
    })
    .sort((a, b) => {
      const aSpec = extractSpecialtyGroup(a.position?.code) === requiredSpecialty ? 1 : 0;
      const bSpec = extractSpecialtyGroup(b.position?.code) === requiredSpecialty ? 1 : 0;
      if (aSpec !== bSpec) return bSpec - aSpec; // Ưu tiên đúng nhóm chuyên môn lên đầu
      const aRank = extractRankNumber(a.position?.code, a.position?.name, a.position?.careerRank) ?? 0;
      const bRank = extractRankNumber(b.position?.code, b.position?.name, b.position?.careerRank) ?? 0;
      if (aRank !== bRank) return bRank - aRank;
      return a.fullName.localeCompare(b.fullName, "vi");
    });

  // Fetch current user details & catalogs
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled || !data.user) return;
        setCurrentUser(data.user);
        // Cấp quản lý (Admin, Giám đốc, PGĐ, Phụ trách BP) tải danh sách người dùng để giao việc/lọc
        if (isManager(data.user.role)) {
          const uRes = await fetch("/api/users");
          if (uRes.ok) {
            const uData = await uRes.json();
            if (!cancelled && uData.users) setUsers(uData.users);
          }
        }
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
    return () => {
      cancelled = true;
    };
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
      if (departmentFilter) params.set("department", departmentFilter);
      if (fieldFilter) params.set("field", fieldFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (taskTypeFilter) params.set("taskType", taskTypeFilter);
      if (assigneeFilter) params.set("assigneeId", assigneeFilter);
      if (approvalFilter) params.set("approvalStatus", approvalFilter);
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
  }, [page, limit, search, departmentFilter, fieldFilter, statusFilter, priorityFilter, taskTypeFilter, assigneeFilter, approvalFilter, startDate, endDate, searchParams]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Audit M18: đóng modal chi tiết phải xóa luôn ?id= trên URL, nếu không mọi
  // lần tải lại danh sách sẽ tự mở lại modal và "khóa" list vào 1 task.
  const closeDetailModal = () => {
    setViewingTask(null);
    if (searchParams.get("id")) {
      router.replace("/tasks");
    }
  };

  // Hỗ trợ phím Esc để đóng nhanh bất kỳ modal nào đang mở
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingTask) {
          closeDetailModal();
        } else if (isCreateModalOpen || editingTask) {
          setIsCreateModalOpen(false);
          setEditingTask(null);
        } else if (isImportModalOpen) {
          setIsImportModalOpen(false);
          setImportFile(null);
          setImportResult(null);
          setImportError("");
        } else if (kpiModalTask) {
          setKpiModalTask(null);
        } else if (approvalModalTask) {
          setApprovalModalTask(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewingTask, isCreateModalOpen, editingTask, isImportModalOpen, kpiModalTask, approvalModalTask]);

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
      const targetPos = positions.find((p) => p.id === found.positionId) || found.position;
      const reqRank = extractRankNumber(targetPos?.code, targetPos?.name, found.position?.code, found.position?.name);
      const reqSpec = extractSpecialtyGroup(targetPos?.code || found.position?.code);

      setFormData((prev) => {
        const isUser = !isManager(currentUser?.role);
        let nextAssigneeId = prev.assigneeId;

        // Chỉ tự đổi người thực hiện khi là Cấp quản lý phân công giao việc
        if (!isUser) {
          const currentAssignee = users.find((u) => u.id === prev.assigneeId);
          const currentAssigneeRank = extractRankNumber(
            currentAssignee?.position?.code,
            currentAssignee?.position?.name,
            currentAssignee?.position?.careerRank
          );
          if (reqRank !== null && (currentAssigneeRank === null || currentAssigneeRank < reqRank)) {
            const validUsers = users.filter((u) => {
              const r = extractRankNumber(u.position?.code, u.position?.name, u.position?.careerRank);
              return r !== null && r >= reqRank;
            });
            const sameSpecUser = validUsers.find((u) => extractSpecialtyGroup(u.position?.code) === reqSpec);
            nextAssigneeId = sameSpecUser?.id || validUsers[0]?.id || "";
          }
        } else {
          nextAssigneeId = currentUser?.id || prev.assigneeId;
        }

        const deptName = isUser
          ? currentUser?.department
          : users.find((u) => u.id === nextAssigneeId)?.department;
        const newField = targetPos?.name
          ? deptName
            ? `Vị trí ${targetPos.name} (BP ${deptName})`
            : `Vị trí ${targetPos.name}`
          : prev.field;

        return {
          ...prev,
          standardTaskId: found.id,
          positionId: found.positionId || prev.positionId,
          groupId: found.groupId || prev.groupId,
          assigneeId: nextAssigneeId,
          title: prev.title ? prev.title : found.name,
          field: newField,
          unit: found.unit,
          benchmarkScore: String(found.benchmarkScore),
          complexityLevel: found.complexityLevel,
          conversionFactor: String(found.conversionFactor),
          assignedVolume: prev.assignedVolume || "1",
          evidenceSource: found.evidenceSource || prev.evidenceSource,
        };
      });
    }
  };

  const openCreateModal = () => {
    const isUser = !isManager(currentUser?.role);
    // Vị trí việc làm & Bộ phận của người đề xuất (nếu là viên chức thì gắn đúng VTVL và bộ phận của chính mình)
    const userPos = isUser
      ? (currentUser?.positionId ? positions.find((p) => p.id === currentUser.positionId) || currentUser.position : null)
      : positions[0];
    const userDept = isUser ? (currentUser?.department || "") : "";

    const reqRank = extractRankNumber(userPos?.code, userPos?.name, userPos?.careerRank);
    const reqSpec = extractSpecialtyGroup(userPos?.code);
    const validUsers = users.filter((u) => {
      const r = extractRankNumber(u.position?.code, u.position?.name, u.position?.careerRank);
      return reqRank !== null ? r !== null && r >= reqRank : true;
    });
    const defaultUser = isUser
      ? currentUser
      : validUsers.find((u) => extractSpecialtyGroup(u.position?.code) === reqSpec) || validUsers[0] || users[0];

    const initialField = isUser
      ? userPos
        ? userDept
          ? `Vị trí ${userPos.name} (BP ${userDept})`
          : `Vị trí ${userPos.name}`
        : userDept
        ? `Bộ phận ${userDept}`
        : "Khám chữa bệnh & Y tế dự phòng"
      : userPos
      ? userDept
        ? `Vị trí ${userPos.name} (BP ${userDept})`
        : `Vị trí ${userPos.name}`
      : "Khám chữa bệnh & Y tế dự phòng";

    setFormData({
      code: isUser ? `DX-${Date.now().toString().slice(-6)}` : `TYT-2026-${Math.floor(100 + Math.random() * 900)}`,
      title: "",
      field: initialField,
      assigneeId: defaultUser?.id || currentUser?.id || "",
      deadline: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      priority: isUser ? "MEDIUM" : "LOW",
      taskType: isUser ? "AD_HOC" : "RECURRING",
      status: "TODO",
      result: "",
      notes: "",
      evidenceSource: "",
      evidenceFiles: [],
      taskSource: isUser ? "Chính quyền điện tử (Hệ thống điều hành)" : "",
      positionId: isUser ? (currentUser?.positionId || userPos?.id || "") : (userPos?.id || ""),
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
      deadline: toLocalInputValue(task.deadline),
      priority: task.priority,
      taskType: task.taskType || "RECURRING",
      status: task.status,
      result: task.result || "",
      notes: task.notes || "",
      evidenceSource: task.evidenceSource || "",
      evidenceFiles: parseEvidenceFiles(task.evidenceFiles),
      taskSource: task.taskSource || "",
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

  const openApprovalModal = (task: TaskItem, action: "APPROVE" | "REJECT") => {
    setApprovalModalTask(task);
    setApprovalModalAction(action);
    setApprovalModalNote(action === "APPROVE" ? "Đồng ý phê duyệt triển khai nhiệm vụ" : "");
    setApprovalError("");
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvalModalTask) return;
    setIsSubmittingApproval(true);
    setApprovalError("");

    try {
      const res = await fetch(`/api/tasks/${approvalModalTask.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: approvalModalAction,
          approvalNote: approvalModalNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi xử lý phê duyệt");

      setApprovalModalTask(null);
      loadTasks();
    } catch (err: any) {
      setApprovalError(err.message);
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleUploadEvidenceFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    setUploadingFiles(true);
    setFormError("");
    try {
      const fd = new FormData();
      Array.from(selected).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi tải file đính kèm");
      if (Array.isArray(data.files)) {
        setFormData((prev) => ({
          ...prev,
          evidenceFiles: [...prev.evidenceFiles, ...data.files],
        }));
      }
    } catch (err: any) {
      setFormError(err.message || "Lỗi khi tải file");
    } finally {
      setUploadingFiles(false);
      e.target.value = "";
    }
  };

  const handleRemoveEvidenceFile = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      evidenceFiles: prev.evidenceFiles.filter((_, i) => i !== idx),
    }));
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

  const openKpiModal = (task: TaskItem, defaultMode?: "SELF" | "DEPT_HEAD" | "DIRECTOR_ADJUST") => {
    setKpiModalTask(task);

    // Xác định mode phù hợp nhất với vai trò và bối cảnh
    let chosenMode: "SELF" | "DEPT_HEAD" | "DIRECTOR_ADJUST" = defaultMode || "SELF";
    if (!defaultMode) {
      if (currentUser?.id === task.assigneeId) {
        chosenMode = "SELF";
      } else if (canExecutiveAdjustKpi(currentUser)) {
        chosenMode = "DIRECTOR_ADJUST";
      } else if (canDepartmentHeadAdjustKpi(currentUser, task.assignee)) {
        chosenMode = "DEPT_HEAD";
      }
    }
    setKpiModalMode(chosenMode);

    if (chosenMode === "SELF") {
      setKpiFormData({
        kpiQuantity:
          task.selfKpiQuantity !== null && task.selfKpiQuantity !== undefined
            ? String(task.selfKpiQuantity)
            : task.kpiQuantity !== null && task.kpiQuantity !== undefined
            ? String(task.kpiQuantity)
            : "100",
        kpiProgress:
          task.selfKpiProgress !== null && task.selfKpiProgress !== undefined
            ? String(task.selfKpiProgress)
            : task.kpiProgress !== null && task.kpiProgress !== undefined
            ? String(task.kpiProgress)
            : "100",
        kpiQuality:
          task.selfKpiQuality !== null && task.selfKpiQuality !== undefined
            ? String(task.selfKpiQuality)
            : task.kpiQuality !== null && task.kpiQuality !== undefined
            ? String(task.kpiQuality)
            : "100",
        kpiComment: task.selfKpiComment || "",
        directorEvidence: "",
      });
    } else if (chosenMode === "DIRECTOR_ADJUST") {
      setKpiFormData({
        kpiQuantity: task.kpiQuantity !== null && task.kpiQuantity !== undefined ? String(task.kpiQuantity) : "100",
        kpiProgress: task.kpiProgress !== null && task.kpiProgress !== undefined ? String(task.kpiProgress) : "100",
        kpiQuality: task.kpiQuality !== null && task.kpiQuality !== undefined ? String(task.kpiQuality) : "100",
        kpiComment: task.directorComment || task.kpiComment || "",
        directorEvidence: task.directorEvidence || "",
      });
    } else {
      // DEPT_HEAD
      setKpiFormData({
        kpiQuantity:
          task.kpiQuantity !== null && task.kpiQuantity !== undefined
            ? String(task.kpiQuantity)
            : task.selfKpiQuantity !== null && task.selfKpiQuantity !== undefined
            ? String(task.selfKpiQuantity)
            : "100",
        kpiProgress:
          task.kpiProgress !== null && task.kpiProgress !== undefined
            ? String(task.kpiProgress)
            : task.selfKpiProgress !== null && task.selfKpiProgress !== undefined
            ? String(task.selfKpiProgress)
            : "100",
        kpiQuality:
          task.kpiQuality !== null && task.kpiQuality !== undefined
            ? String(task.kpiQuality)
            : task.selfKpiQuality !== null && task.selfKpiQuality !== undefined
            ? String(task.selfKpiQuality)
            : "100",
        kpiComment: task.kpiComment || "",
        directorEvidence: "",
      });
    }
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

    if (kpiModalMode === "DIRECTOR_ADJUST" && !kpiFormData.directorEvidence.trim()) {
      setKpiFormError("Bắt buộc phải nhập bằng chứng cụ thể khi Ban Giám đốc đề nghị điều chỉnh điểm KPI (ví dụ: Biên bản kiểm tra chuyên môn, đối soát HIS/BHYT...)");
      setIsSubmittingKpi(false);
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${kpiModalTask.id}/kpi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: kpiModalMode,
          kpiQuantity: quantityNum,
          kpiProgress: progressNum,
          kpiQuality: qualityNum,
          kpiComment: kpiFormData.kpiComment,
          selfKpiComment: kpiFormData.kpiComment,
          directorEvidence: kpiFormData.directorEvidence,
          directorComment: kpiFormData.kpiComment,
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

        <div className="flex items-center gap-2">
          {isExecutive(currentUser?.role) && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
            >
              <FileSpreadsheet className="w-4 h-4" /> Import Excel
            </button>
          )}
          {isManager(currentUser?.role) ? (
            <button
              onClick={openCreateModal}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4" /> Tạo Công Việc Mới
            </button>
          ) : (
            <button
              onClick={openCreateModal}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
              title="Viên chức tự tạo nhiệm vụ đột xuất khi nhận từ Chính quyền điện tử hoặc cấp trên giao trực tiếp"
            >
              <Plus className="w-4 h-4" /> Đề Xuất Việc Đột Xuất
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Tìm kiếm: Tên nhân sự, Mã việc, Tên việc..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={currentUser?.role === "DEPARTMENT_HEAD" ? currentUser.department || "" : departmentFilter}
            disabled={currentUser?.role === "DEPARTMENT_HEAD"}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-85 disabled:bg-gray-100"
          >
            {currentUser?.role === "DEPARTMENT_HEAD" ? (
              <option value={currentUser.department || ""}>
                BP {currentUser.department} (Bộ phận của bạn)
              </option>
            ) : (
              <>
                <option value="">-- Tất cả 5 bộ phận --</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    BP {dept}
                  </option>
                ))}
              </>
            )}
          </select>

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
            value={approvalFilter}
            onChange={(e) => {
              setApprovalFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Phê duyệt (Tất cả) --</option>
            <option value="PENDING">⏳ Chờ duyệt</option>
            <option value="APPROVED">✓ Đã duyệt</option>
            <option value="REJECTED">✕ Từ chối</option>
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

          {isManager(currentUser?.role) && (
            <select
              value={assigneeFilter}
              onChange={(e) => {
                setAssigneeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Người thực hiện --</option>
              {users
                .filter((u) => {
                  if (currentUser?.role === "DEPARTMENT_HEAD" && currentUser.department) {
                    const sameDept =
                      u.department && u.department.trim().toLowerCase() === currentUser.department.trim().toLowerCase();
                    return sameDept || u.id === currentUser.id;
                  }
                  return true;
                })
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} {u.department ? `(${u.department})` : ""}
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
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1); // Audit L3: đổi filter phải về trang đầu.
              }}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs"
            />
            <span className="text-gray-400">&rarr;</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1); // Audit L3: đổi filter phải về trang đầu.
              }}
              className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setApprovalFilter(approvalFilter === "PENDING" ? "" : "PENDING");
                setPage(1);
              }}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition border flex items-center gap-1.5 ${
                approvalFilter === "PENDING"
                  ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
              }`}
            >
              <span>⏳ Việc chờ duyệt</span>
              {tasks.filter((t) => t.approvalStatus === "PENDING").length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${approvalFilter === "PENDING" ? "bg-white text-amber-800" : "bg-amber-200 text-amber-900"}`}>
                  {tasks.filter((t) => t.approvalStatus === "PENDING").length}
                </span>
              )}
            </button>

            {(search || departmentFilter || statusFilter || priorityFilter || taskTypeFilter || assigneeFilter || approvalFilter || startDate || endDate) && (
              <button
                onClick={() => {
                  setSearch("");
                  setDepartmentFilter("");
                  setStatusFilter("");
                  setPriorityFilter("");
                  setTaskTypeFilter("");
                  setAssigneeFilter("");
                  setApprovalFilter("");
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                }}
                className="text-red-600 hover:underline font-bold ml-2"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
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
                        {task.taskSource && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200" title={`Nguồn việc: ${task.taskSource}`}>
                              📌 {task.taskSource}
                            </span>
                          </div>
                        )}
                        {(task.unit || parseEvidenceFiles(task.evidenceFiles).length > 0) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                            {task.unit && (
                              <>
                                <span className="bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded font-bold">
                                  {task.unit}
                                </span>
                                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                                  ĐC: {task.benchmarkScore}đ
                                </span>
                                <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                                  {task.complexityLevel} (x{task.conversionFactor})
                                </span>
                              </>
                            )}
                            {parseEvidenceFiles(task.evidenceFiles).length > 0 && (
                              <span
                                onClick={() => setViewingTask(task)}
                                className="bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-0.5 cursor-pointer hover:bg-sky-100"
                                title="Xem các file đính kèm minh chứng"
                              >
                                <Paperclip className="w-2.5 h-2.5" /> {parseEvidenceFiles(task.evidenceFiles).length} file
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-gray-600">{task.field}</td>
                      <td className="p-3.5 font-medium text-gray-800">
                        <div>{task.assignee.fullName}</div>
                        {task.assignee.department && (
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              DEPARTMENT_BADGE_CLASSES[task.assignee.department as Department] ||
                              "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {task.assignee.department}
                          </span>
                        )}
                      </td>
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
                        <div className="flex flex-col gap-1 items-start">
                          {task.approvalStatus === "PENDING" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                              ⏳ Chờ duyệt
                            </span>
                          ) : task.approvalStatus === "REJECTED" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300" title={task.approvalNote || "Từ chối duyệt"}>
                              ✕ Từ chối
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              ✓ Đã duyệt
                            </span>
                          )}

                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              task.approvalStatus === "PENDING"
                                ? "bg-gray-100 text-gray-500 italic"
                                : task.status === "COMPLETED"
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
                            {task.approvalStatus === "PENDING" ? "Chưa triển khai" : formatStatus(task.status)}
                          </span>
                        </div>
                        {task.assignedScore !== null && task.assignedScore !== undefined && (
                          <div className="block">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-900 border border-teal-200">
                              <Star className="w-3 h-3 text-teal-600" /> Điểm: {task.completedScore ?? 0}/{task.assignedScore} ({task.completionRate ?? 0}%)
                            </span>
                          </div>
                        )}
                        {task.status === "COMPLETED" && (
                          <div className="block space-y-0.5 mt-0.5">
                            {task.directorAdjustedAt ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300"
                                title={`Ban Giám đốc đã điều chỉnh kèm bằng chứng: ${task.directorEvidence || ""}`}
                              >
                                <Award className="w-3 h-3 text-rose-600" /> KPI BGD: {task.kpiScore}% (Đã kiểm chứng)
                              </span>
                            ) : task.kpiEvaluatedAt ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                                <Award className="w-3 h-3 text-purple-600" /> KPI BP: {task.kpiScore}%
                              </span>
                            ) : task.selfKpiEvaluatedAt ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                <Award className="w-3 h-3 text-amber-600" /> Tự chấm: {task.selfKpiScore}% (Chờ duyệt)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                Chưa tự chấm KPI
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-right space-x-1">
                        {/* Nút Phê duyệt / Từ chối cho Phụ trách bộ phận & Ban Giám đốc */}
                        {task.approvalStatus === "PENDING" && canApproveTask(currentUser, task) && (
                          <div className="inline-flex items-center gap-1 mr-1 p-0.5 bg-amber-50 rounded-lg border border-amber-200">
                            <button
                              onClick={() => openApprovalModal(task, "APPROVE")}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded flex items-center gap-0.5 transition shadow-sm"
                              title="Phê duyệt nhiệm vụ để viên chức triển khai"
                            >
                              <Check className="w-3 h-3" /> Duyệt
                            </button>
                            <button
                              onClick={() => openApprovalModal(task, "REJECT")}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded flex items-center gap-0.5 transition shadow-sm"
                              title="Từ chối phê duyệt nhiệm vụ này"
                            >
                              <X className="w-3 h-3" /> Từ chối
                            </button>
                          </div>
                        )}

                        {/* 1. Cá nhân tự chấm điểm KPI */}
                        {task.status === "COMPLETED" && currentUser?.id === task.assigneeId && (
                          <button
                            onClick={() => openKpiModal(task, "SELF")}
                            className="p-1.5 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition border border-amber-200"
                            title="Cá nhân được giao việc tự chấm điểm KPI"
                          >
                            <Award className="w-3.5 h-3.5 text-amber-600" />
                            {task.selfKpiEvaluatedAt ? "Sửa tự chấm" : "Tự chấm KPI"}
                          </button>
                        )}

                        {/* 2. Phụ trách bộ phận duyệt và điều chỉnh KPI nhân viên trong bộ phận */}
                        {task.status === "COMPLETED" && canDepartmentHeadAdjustKpi(currentUser, task.assignee) && (
                          <button
                            onClick={() => openKpiModal(task, "DEPT_HEAD")}
                            className="p-1.5 text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition border border-purple-200"
                            title="Phụ trách bộ phận xem và điều chỉnh điểm KPI nhân viên"
                          >
                            <Award className="w-3.5 h-3.5 text-purple-600" />
                            {task.kpiEvaluatedAt ? "Sửa KPI BP" : "Duyệt / Chấm KPI"}
                          </button>
                        )}

                        {/* 3. Ban Giám đốc đề nghị điều chỉnh điểm KPI khi có bằng chứng */}
                        {task.status === "COMPLETED" && canExecutiveAdjustKpi(currentUser) && currentUser?.id !== task.assigneeId && (
                          <button
                            onClick={() => openKpiModal(task, "DIRECTOR_ADJUST")}
                            className="p-1.5 text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition border border-rose-200"
                            title="Ban Giám đốc đề nghị điều chỉnh điểm KPI khi có bằng chứng cụ thể"
                          >
                            <Award className="w-3.5 h-3.5 text-rose-600" />
                            {task.directorAdjustedAt ? "BGD sửa điều chỉnh" : "BGD điều chỉnh KPI"}
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
                        {isExecutive(currentUser?.role) && (
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
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDetailModal();
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl relative my-auto overflow-hidden">
            {/* Header cố định trên cùng, luôn hiện rõ tiêu đề và nút đóng */}
            <div className="flex items-start justify-between gap-3 p-5 sm:p-6 pb-3 border-b border-gray-100 bg-white shrink-0">
              <div className="space-y-1 pr-2">
                <span className="font-mono text-xs font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded inline-block">
                  {viewingTask.code}
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-snug">{viewingTask.title}</h3>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                title="Đóng (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nội dung chi tiết có thanh cuộn riêng khi quá dài */}
            <div className="p-5 sm:p-6 pt-3 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3 text-xs border-b border-gray-100 pb-3">
                <div>
                  <p className="text-gray-400 font-semibold">Lĩnh vực:</p>
                  <p className="font-bold text-gray-800">{viewingTask.field}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-semibold">Người thực hiện:</p>
                  <p className="font-bold text-gray-800 flex items-center gap-2 flex-wrap">
                    <span>{viewingTask.assignee.fullName}</span>
                    {viewingTask.assignee.department && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          DEPARTMENT_BADGE_CLASSES[viewingTask.assignee.department as Department] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {viewingTask.assignee.department}
                      </span>
                    )}
                  </p>
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
                  <p className="text-gray-400 font-semibold">Phê duyệt nhiệm vụ:</p>
                  <div className="font-bold mt-0.5">
                    {viewingTask.approvalStatus === "PENDING" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                        ⏳ Chờ Cán bộ phụ trách phê duyệt
                      </span>
                    ) : viewingTask.approvalStatus === "REJECTED" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                        ✕ Từ chối phê duyệt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✓ Đã phê duyệt {viewingTask.approver ? `(bởi ${viewingTask.approver.fullName})` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 font-semibold">Trạng thái triển khai:</p>
                  <p className="font-bold text-gray-800">
                    {viewingTask.approvalStatus === "PENDING" ? (
                      <span className="text-amber-700 italic">Chưa triển khai (Chờ duyệt)</span>
                    ) : (
                      formatStatus(viewingTask.status)
                    )}
                  </p>
                </div>
                {viewingTask.taskSource && (
                  <div className="col-span-2">
                    <p className="text-gray-400 font-semibold">Nguồn nhiệm vụ đột xuất:</p>
                    <p className="font-bold text-purple-800 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200 mt-0.5">
                      📌 {viewingTask.taskSource}
                    </p>
                  </div>
                )}
                {viewingTask.approvalNote && (
                  <div className="col-span-2">
                    <p className="text-gray-400 font-semibold">Ý kiến / Nhận xét phê duyệt:</p>
                    <p className="font-medium text-gray-800 italic bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-200 mt-0.5">
                      "{viewingTask.approvalNote}"
                    </p>
                  </div>
                )}
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
                {(viewingTask.evidenceSource || parseEvidenceFiles(viewingTask.evidenceFiles).length > 0) && (
                  <div className="space-y-2">
                    <p className="text-gray-500 font-bold">Nguồn số liệu kiểm chứng & File minh chứng (Biểu B1 / QĐ 1399):</p>
                    {viewingTask.evidenceSource && (
                      <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl text-blue-900 font-medium">
                        {viewingTask.evidenceSource}
                      </div>
                    )}
                    {parseEvidenceFiles(viewingTask.evidenceFiles).length > 0 && (
                      <div className="grid grid-cols-1 gap-2 pt-1">
                        {parseEvidenceFiles(viewingTask.evidenceFiles).map((f, idx) => (
                          <a
                            key={idx}
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 p-2.5 bg-sky-50/60 hover:bg-sky-100/70 border border-sky-200 rounded-xl transition group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isImageFile(f) ? (
                                <img
                                  src={f.url}
                                  alt={f.name}
                                  className="w-10 h-10 object-cover rounded-lg border border-sky-200 shrink-0 bg-white"
                                />
                              ) : (
                                <span className="px-2 py-1.5 bg-blue-600 text-white font-black text-[10px] rounded-lg shrink-0 uppercase">
                                  {getFileExtBadge(f)}
                                </span>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-blue-950 truncate group-hover:text-blue-700 group-hover:underline">
                                  {f.name}
                                </p>
                                {f.size ? (
                                  <p className="text-[10px] text-gray-500">{formatFileSize(f.size)}</p>
                                ) : null}
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 shrink-0 px-2 py-1 bg-white rounded-lg border border-blue-100 shadow-sm">
                              <ExternalLink className="w-3.5 h-3.5" /> Mở / Tải
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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

              {/* KHỐI 1: CÁ NHÂN TỰ CHẤM ĐIỂM KPI */}
              {viewingTask.selfKpiScore !== null && viewingTask.selfKpiScore !== undefined && (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                    <div className="flex items-center gap-1.5 font-black text-amber-900 text-sm">
                      <Award className="w-4 h-4 text-amber-700" /> 1. Cá Nhân Tự Chấm Điểm KPI
                    </div>
                    <span className="px-2.5 py-1 bg-amber-600 text-white font-black rounded-lg text-xs">
                      TỰ CHẤM: {viewingTask.selfKpiScore}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-sm">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Số lượng</span>
                      <span className="text-sm font-black text-amber-900">{viewingTask.selfKpiQuantity}</span>
                      <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-sm">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Tiến độ</span>
                      <span className="text-sm font-black text-amber-900">{viewingTask.selfKpiProgress}</span>
                      <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-sm">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Chất lượng</span>
                      <span className="text-sm font-black text-amber-900">{viewingTask.selfKpiQuality}</span>
                      <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                    </div>
                  </div>

                  <div className="pt-1 text-gray-700 space-y-1">
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-amber-950 font-medium">
                      <span><strong>Thời điểm tự chấm:</strong> {formatDate(viewingTask.selfKpiEvaluatedAt)}</span>
                    </div>
                    {viewingTask.selfKpiComment && (
                      <div className="bg-white p-2.5 rounded-xl border border-amber-100 mt-1 italic text-gray-800 text-xs">
                        "{viewingTask.selfKpiComment}"
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* KHỐI 2: PHỤ TRÁCH BỘ PHẬN DUYỆT & ĐIỀU CHỈNH KPI */}
              {viewingTask.kpiEvaluatedAt && (
                <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
                    <div className="flex items-center gap-1.5 font-black text-purple-900 text-sm">
                      <Award className="w-4 h-4 text-purple-700" /> 2. Phụ Trách Bộ Phận Duyệt &amp; Điều Chỉnh KPI
                    </div>
                    <span className="px-2.5 py-1 bg-purple-600 text-white font-black rounded-lg text-xs">
                      KPI DUYỆT: {viewingTask.kpiScore}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-xl border border-purple-100 shadow-sm">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Số lượng</span>
                      <span className="text-base font-black text-purple-900">{viewingTask.kpiQuantity}</span>
                      <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-purple-100 shadow-sm">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Tiến độ</span>
                      <span className="text-base font-black text-purple-900">{viewingTask.kpiProgress}</span>
                      <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-purple-100 shadow-sm">
                      <span className="text-[10px] text-gray-500 font-bold block uppercase">Chất lượng</span>
                      <span className="text-base font-black text-purple-900">{viewingTask.kpiQuality}</span>
                      <span className="text-[10px] text-gray-400 block">/ 100 điểm</span>
                    </div>
                  </div>

                  <div className="pt-1 text-gray-700 space-y-1">
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-purple-950 font-medium gap-1">
                      <span><strong>Người duyệt:</strong> {viewingTask.kpiEvaluator?.fullName || "Phụ trách bộ phận"}</span>
                      <span><strong>Thời điểm duyệt:</strong> {formatDate(viewingTask.kpiEvaluatedAt)}</span>
                    </div>
                    {viewingTask.kpiComment && (
                      <div className="bg-white p-2.5 rounded-xl border border-purple-100 mt-1 italic text-gray-800 text-xs">
                        "{viewingTask.kpiComment}"
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* KHỐI 3: BAN GIÁM ĐỐC ĐỀ NGHỊ ĐIỀU CHỈNH KÈM BẰNG CHỨNG */}
              {viewingTask.directorAdjustedAt && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                    <div className="flex items-center gap-1.5 font-black text-rose-900 text-sm">
                      <Award className="w-4 h-4 text-rose-700" /> 3. Ban Giám Đốc Điều Chỉnh Điểm KPI (Kèm Bằng Chứng)
                    </div>
                    <span className="px-2.5 py-1 bg-rose-600 text-white font-black rounded-lg text-xs">
                      KPI BGD: {viewingTask.kpiScore}%
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-rose-200 space-y-1">
                    <span className="text-[11px] font-black text-rose-900 uppercase block">🔍 BẰNG CHỨNG CỤ THỂ KIỂM CHỨNG:</span>
                    <p className="text-gray-900 font-medium leading-relaxed bg-rose-50/50 p-2 rounded-lg">
                      {viewingTask.directorEvidence}
                    </p>
                  </div>

                  <div className="pt-1 text-gray-700 space-y-1">
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-rose-950 font-medium gap-1">
                      <span><strong>Người điều chỉnh:</strong> {viewingTask.directorAdjuster?.fullName || "Ban Giám đốc"}</span>
                      <span><strong>Thời điểm:</strong> {formatDate(viewingTask.directorAdjustedAt)}</span>
                    </div>
                    {viewingTask.directorComment && (
                      <div className="bg-white p-2.5 rounded-xl border border-rose-100 mt-1 italic text-gray-800 text-xs">
                        "Ý kiến chỉ đạo: {viewingTask.directorComment}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer cố định phía dưới */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between shrink-0">
              {viewingTask.approvalStatus === "PENDING" && canApproveTask(currentUser, viewingTask) ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const t = viewingTask;
                      closeDetailModal();
                      openApprovalModal(t, "APPROVE");
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition"
                  >
                    <Check className="w-4 h-4" /> Phê Duyệt Nhiệm Vụ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const t = viewingTask;
                      closeDetailModal();
                      openApprovalModal(t, "REJECT");
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition"
                  >
                    <X className="w-4 h-4" /> Từ Chối
                  </button>
                </div>
              ) : <div />}
              <button
                type="button"
                onClick={closeDetailModal}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl transition-colors"
              >
                Đóng (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Create / Edit Task */}
      {(isCreateModalOpen || editingTask) && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreateModalOpen(false);
              setEditingTask(null);
            }
          }}
        >
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
                ? isManager(currentUser?.role)
                  ? "Chỉnh Sửa Công Việc"
                  : `Cập Nhật Công Việc ${editingTask.approvalStatus === "PENDING" ? "(Chờ phê duyệt)" : ""}`
                : isManager(currentUser?.role)
                ? "Tạo Công Việc Mới"
                : "Đề Xuất Nhiệm Vụ Đột Xuất Mới"}
            </h3>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl">{formError}</div>
            )}

            {/* Banner hướng dẫn khi Viên chức tạo việc đột xuất mới */}
            {!isManager(currentUser?.role) && !editingTask && (
              <div className="p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>QUY TRÌNH PHÊ DUYỆT NHIỆM VỤ ĐỘT XUẤT</span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  Viên chức được tự tạo việc mới khi có việc đột xuất được giao từ <strong>Chính quyền điện tử</strong>, nhận trực tiếp từ <strong>cấp trên</strong>... Sau khi tạo, nhiệm vụ sẽ ở trạng thái <strong>Chờ phê duyệt</strong> và chỉ được triển khai thực hiện sau khi <strong>Cán bộ phụ trách bộ phận</strong> phê duyệt.
                </p>
              </div>
            )}

            {/* Cảnh báo khi chỉnh sửa task đang chờ duyệt */}
            {editingTask && editingTask.approvalStatus === "PENDING" && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Nhiệm vụ đang chờ Cán bộ phụ trách bộ phận phê duyệt</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Bạn có thể cập nhật thông tin, ghi chú hoặc minh chứng. Nhiệm vụ chưa được phép chuyển sang trạng thái <strong>Đang thực hiện</strong> cho đến khi Cán bộ phụ trách phê duyệt.
                </p>
              </div>
            )}

            <form onSubmit={handleSaveTask} className="space-y-4 text-xs">
              {/* Khối Chuẩn Hóa Chức Danh & Công Việc Chuẩn: Cho phép cả Quản lý và Viên chức chọn theo VTVL */}
              <div className="p-3.5 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-black text-blue-900 text-xs flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-700" /> Chuẩn Hóa Chức Danh &amp; Công Việc Chuẩn
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
                    <label className="block font-semibold text-gray-700 mb-1">
                      1. Vị trí việc làm {!isManager(currentUser?.role) ? "(Tự động gắn theo bạn)" : ""}
                    </label>
                    {!isManager(currentUser?.role) && (currentUser?.positionId || currentUser?.position) ? (
                      <div className="p-2.5 bg-white border border-blue-200 rounded-xl text-xs font-bold text-blue-950 flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                          <span className="truncate">
                            {positions.find((p) => p.id === (formData.positionId || currentUser.positionId))?.name ||
                              currentUser.position?.name ||
                              "Vị trí việc làm"}
                          </span>
                          <span className="text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                            {positions.find((p) => p.id === (formData.positionId || currentUser.positionId))?.code ||
                              currentUser.position?.code}
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-2 py-0.5 rounded-full shrink-0">
                          ✓ Gắn tự động
                        </span>
                      </div>
                    ) : (
                      <select
                        value={formData.positionId}
                        onChange={(e) => {
                          const newPosId = e.target.value;
                          const newPos = positions.find((p) => p.id === newPosId);
                          const isUser = !isManager(currentUser?.role);
                          const reqRank = extractRankNumber(newPos?.code, newPos?.name, newPos?.careerRank);
                          const reqSpec = extractSpecialtyGroup(newPos?.code);

                          setFormData((prev) => {
                            const deptName = isUser ? currentUser?.department : "";
                            const updatedField = newPos
                              ? deptName
                                ? `Vị trí ${newPos.name} (BP ${deptName})`
                                : `Vị trí ${newPos.name}`
                              : prev.field;

                            let nextAssigneeId = prev.assigneeId;
                            if (!isUser && reqRank !== null) {
                              const currentAssignee = users.find((u) => u.id === prev.assigneeId);
                              const currentRank = extractRankNumber(
                                currentAssignee?.position?.code,
                                currentAssignee?.position?.name,
                                currentAssignee?.position?.careerRank
                              );
                              if (currentRank === null || currentRank < reqRank) {
                                const validUsers = users.filter((u) => {
                                  const r = extractRankNumber(u.position?.code, u.position?.name, u.position?.careerRank);
                                  return r !== null && r >= reqRank;
                                });
                                const sameSpecUser = validUsers.find(
                                  (u) => extractSpecialtyGroup(u.position?.code) === reqSpec
                                );
                                nextAssigneeId = sameSpecUser?.id || validUsers[0]?.id || "";
                              }
                            } else if (isUser) {
                              nextAssigneeId = currentUser?.id || prev.assigneeId;
                            }

                            return {
                              ...prev,
                              positionId: newPosId,
                              field: updatedField,
                              assigneeId: nextAssigneeId,
                              groupId: "",
                              standardTaskId: "",
                              unit: "",
                              benchmarkScore: "",
                              complexityLevel: "",
                              conversionFactor: "",
                            };
                          });
                        }}
                        className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Chọn vị trí việc làm --</option>
                        {positions.map((pos) => (
                          <option key={pos.id} value={pos.id}>
                            {pos.name} ({pos.code}) {currentUser?.positionId === pos.id ? "★ [VTVL của bạn]" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">
                      2. Chọn công việc chuẩn {!isManager(currentUser?.role) ? "(theo VTVL của bạn)" : ""}
                    </label>
                    <select
                      value={formData.standardTaskId}
                      onChange={(e) => handleStandardTaskChange(e.target.value)}
                      className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs font-medium"
                    >
                      <option value="">-- Tùy chỉnh (Không chọn chuẩn) --</option>
                      {standardTasks
                        .filter((st) => {
                          const targetPosId = formData.positionId || (!isManager(currentUser?.role) ? currentUser?.positionId : "");
                          return !targetPosId || st.positionId === targetPosId;
                        })
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
                        Tự động điền &amp; Khóa chuẩn
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

              {/* Form dành cho Quản lý tạo/sửa việc */}
              {isManager(currentUser?.role) ? (
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
                      <label className="block font-bold text-gray-700 mb-1">Lĩnh vực / Bộ phận *</label>
                      <input
                        type="text"
                        required
                        list="vtvl-field-options"
                        value={formData.field}
                        onChange={(e) => {
                          const newField = e.target.value;
                          const matchedPos = positions.find(
                            (p) =>
                              newField.toLowerCase().includes(p.name.toLowerCase()) ||
                              newField.toLowerCase().includes(p.code.toLowerCase())
                          );
                          setFormData((prev) => ({
                            ...prev,
                            field: newField,
                            ...(matchedPos ? { positionId: matchedPos.id } : {}),
                          }));
                        }}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                      />
                      <datalist id="vtvl-field-options">
                        {positions.map((pos) => (
                          <option key={pos.id} value={`Vị trí ${pos.name}`} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Tên công việc *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nhập tên nhiệm vụ hoặc chọn công việc chuẩn ở trên..."
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1">
                        Người thực hiện {requiredRank !== null ? `(Chỉ hiện B${requiredRank}–B5: ${eligibleUsers.length} người)` : "*"} *
                      </label>
                      <select
                        required
                        value={formData.assigneeId}
                        onChange={(e) => {
                          const newAssigneeId = e.target.value;
                          const selectedUser = users.find((u) => u.id === newAssigneeId);
                          setFormData((prev) => ({
                            ...prev,
                            assigneeId: newAssigneeId,
                            ...(!prev.positionId && selectedUser?.positionId
                              ? {
                                  positionId: selectedUser.positionId,
                                  field: selectedUser.position?.name
                                    ? selectedUser.department
                                      ? `Vị trí ${selectedUser.position.name} (BP ${selectedUser.department})`
                                      : `Vị trí ${selectedUser.position.name}`
                                    : prev.field,
                                }
                              : {}),
                          }));
                        }}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                      >
                        <option value="">
                          {requiredRank !== null
                            ? `-- Chọn viên chức có VTVL từ Bậc ${requiredRank} trở lên (B${requiredRank}–B5) --`
                            : "-- Chọn viên chức thực hiện --"}
                        </option>
                        {requiredRank !== null && requiredSpecialty ? (
                          <>
                            {eligibleUsers.some((u) => extractSpecialtyGroup(u.position?.code) === requiredSpecialty) && (
                              <optgroup label={`★ Đúng nhóm chuyên môn (Bậc >= B${requiredRank})`}>
                                {eligibleUsers
                                  .filter((u) => extractSpecialtyGroup(u.position?.code) === requiredSpecialty)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.fullName} {u.position ? `[${u.position.code}]` : ""} - {u.department ? `BP ${u.department}` : (u.workLocation || "Trạm chính")}
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                            {eligibleUsers.some((u) => extractSpecialtyGroup(u.position?.code) !== requiredSpecialty) && (
                              <optgroup label={`Nhóm chuyên môn khác / Lãnh đạo có Bậc >= B${requiredRank}`}>
                                {eligibleUsers
                                  .filter((u) => extractSpecialtyGroup(u.position?.code) !== requiredSpecialty)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.fullName} {u.position ? `[${u.position.code}]` : ""} - {u.department ? `BP ${u.department}` : (u.workLocation || "Trạm chính")}
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </>
                        ) : (
                          eligibleUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName} {u.position ? `[${u.position.code}]` : ""} - {u.department ? `BP ${u.department}` : (u.workLocation || "Trạm chính")}
                            </option>
                          ))
                        )}
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
              ) : (
                /* Form dành cho Viên chức tự tạo / chỉnh sửa việc đột xuất */
                <>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Nguồn giao nhiệm vụ đột xuất *
                    </label>
                    <input
                      type="text"
                      required
                      list="task-source-options"
                      placeholder="Chọn hoặc nhập nguồn: Chính quyền điện tử, Cấp trên giao trực tiếp..."
                      value={formData.taskSource}
                      onChange={(e) => setFormData({ ...formData, taskSource: e.target.value })}
                      className="w-full p-2.5 bg-purple-50/50 border border-purple-200 rounded-xl font-medium"
                    />
                    <datalist id="task-source-options">
                      <option value="Chính quyền điện tử (Hệ thống điều hành)" />
                      <option value="Nhận trực tiếp từ cấp trên giao" />
                      <option value="Văn bản / Công văn chỉ đạo khẩn" />
                      <option value="Đột xuất phát sinh tại trạm y tế" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Tên công việc đột xuất *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nhập tên nhiệm vụ hoặc chọn công việc chuẩn ở trên..."
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1 flex items-center justify-between">
                        <span>Lĩnh vực / Bộ phận *</span>
                        <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                          Tự động gắn theo VTVL
                        </span>
                      </label>
                      <input
                        type="text"
                        required
                        readOnly
                        value={formData.field}
                        title="Tự động gắn theo Vị trí việc làm và Bộ phận của bạn"
                        className="w-full p-2.5 bg-gray-100/90 border border-gray-200 text-gray-800 rounded-xl font-medium cursor-not-allowed"
                      />
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1">Người thực hiện</label>
                      <input
                        type="text"
                        disabled
                        value={`${currentUser?.fullName || "Bạn"} ${currentUser?.position ? `[${currentUser.position.code}]` : ""} ${currentUser?.department ? `(BP ${currentUser.department})` : ""}`}
                        className="w-full p-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-700 font-bold"
                      />
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

              {/* Status, Result, Notes */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Trạng thái công việc</label>
                <select
                  value={formData.status}
                  disabled={editingTask?.approvalStatus === "PENDING" || (!isManager(currentUser?.role) && !editingTask)}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl disabled:bg-gray-100 disabled:text-gray-500 font-semibold"
                >
                  {editingTask?.approvalStatus === "PENDING" || (!isManager(currentUser?.role) && !editingTask) ? (
                    <option value="TODO">Chưa thực hiện (Đang chờ Cán bộ phụ trách phê duyệt)</option>
                  ) : (
                    <>
                      <option value="TODO">Chưa thực hiện</option>
                      <option value="IN_PROGRESS">Đang thực hiện</option>
                      <option value="PAUSED">Tạm dừng</option>
                      <option value="COMPLETED">Hoàn thành</option>
                      <option value="CANCELLED">Hủy</option>
                    </>
                  )}
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

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block font-bold text-gray-700">
                    Nguồn kiểm chứng sản phẩm (Phần mềm HIS, Cổng BHYT, Sổ TCMR, MIS, QLVB...)
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-[11px] cursor-pointer transition shadow-sm">
                    <Paperclip className="w-3.5 h-3.5" />
                    {uploadingFiles ? "Đang tải file..." : "+ Đính kèm file (Ảnh, Docx, PDF...)"}
                    <input
                      type="file"
                      multiple
                      disabled={uploadingFiles}
                      accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.zip,.rar,.7z"
                      onChange={handleUploadEvidenceFiles}
                      className="hidden"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Tự động điền theo Danh mục công việc chuẩn hoặc nhập cụ thể..."
                  value={formData.evidenceSource}
                  onChange={(e) => setFormData({ ...formData, evidenceSource: e.target.value })}
                  className="w-full p-2.5 bg-blue-50/40 border border-blue-200 rounded-xl"
                />

                {/* Danh sách file đính kèm minh chứng */}
                {formData.evidenceFiles.length > 0 && (
                  <div className="p-2.5 bg-sky-50/50 border border-sky-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-sky-900">
                      <span className="flex items-center gap-1">
                        <Paperclip className="w-3 h-3 text-sky-700" /> File minh chứng đính kèm ({formData.evidenceFiles.length}):
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {formData.evidenceFiles.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-2 bg-white border border-sky-100 rounded-lg shadow-sm"
                        >
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 min-w-0 flex-1 hover:underline text-blue-900"
                          >
                            {isImageFile(f) ? (
                              <img
                                src={f.url}
                                alt={f.name}
                                className="w-8 h-8 object-cover rounded border border-gray-200 shrink-0"
                              />
                            ) : (
                              <span className="px-1.5 py-1 bg-blue-600 text-white font-black text-[9px] rounded shrink-0 uppercase">
                                {getFileExtBadge(f)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-xs truncate text-blue-800">{f.name}</p>
                              {f.size ? (
                                <p className="text-[10px] text-gray-400">{formatFileSize(f.size)}</p>
                              ) : null}
                            </div>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveEvidenceFile(idx)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                            title="Gỡ file này"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsImportModalOpen(false);
              setImportFile(null);
              setImportResult(null);
              setImportError("");
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
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

      {/* KPI Scoring Modal (Quy trình 3 cấp: Cá nhân -> Phụ trách BP -> Ban Giám đốc) */}
      {kpiModalTask && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setKpiModalTask(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setKpiModalTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header phân biệt theo vai trò chấm */}
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div
                className={`p-2.5 rounded-xl ${
                  kpiModalMode === "SELF"
                    ? "bg-amber-100 text-amber-700"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-purple-100 text-purple-700"
                }`}
              >
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 uppercase">
                  {kpiModalMode === "SELF"
                    ? "CÁ NHÂN TỰ CHẤM ĐIỂM KPI"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "BAN GIÁM ĐỐC ĐỀ NGHỊ ĐIỀU CHỈNH KPI"
                    : "PHỤ TRÁCH BỘ PHẬN DUYỆT & ĐIỀU CHỈNH KPI"}
                </h3>
                <p className="text-xs text-gray-500">
                  {kpiModalMode === "SELF"
                    ? "Viên chức được giao việc tự đánh giá kết quả hoàn thành"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "Yêu cầu bắt buộc cung cấp bằng chứng cụ thể khi điều chỉnh điểm"
                    : "Duyệt hoặc điều chỉnh điểm KPI cho nhân viên thuộc bộ phận phụ trách"}
                </p>
              </div>
            </div>

            {/* Chuyển đổi Mode nhanh nếu người dùng có nhiều thẩm quyền */}
            {(isExecutive(currentUser?.role) || (currentUser?.role === "DEPARTMENT_HEAD" && currentUser?.id === kpiModalTask.assigneeId)) && (
              <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-bold gap-1">
                {currentUser?.id === kpiModalTask.assigneeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setKpiModalMode("SELF");
                      setKpiFormData({
                        kpiQuantity: kpiModalTask.selfKpiQuantity ? String(kpiModalTask.selfKpiQuantity) : "100",
                        kpiProgress: kpiModalTask.selfKpiProgress ? String(kpiModalTask.selfKpiProgress) : "100",
                        kpiQuality: kpiModalTask.selfKpiQuality ? String(kpiModalTask.selfKpiQuality) : "100",
                        kpiComment: kpiModalTask.selfKpiComment || "",
                        directorEvidence: "",
                      });
                    }}
                    className={`flex-1 py-1.5 rounded-lg transition ${
                      kpiModalMode === "SELF" ? "bg-white text-amber-800 shadow-sm" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    1. Cá nhân tự chấm
                  </button>
                )}
                {canDepartmentHeadAdjustKpi(currentUser, kpiModalTask.assignee) && (
                  <button
                    type="button"
                    onClick={() => {
                      setKpiModalMode("DEPT_HEAD");
                      setKpiFormData({
                        kpiQuantity: kpiModalTask.kpiQuantity ? String(kpiModalTask.kpiQuantity) : (kpiModalTask.selfKpiQuantity ? String(kpiModalTask.selfKpiQuantity) : "100"),
                        kpiProgress: kpiModalTask.kpiProgress ? String(kpiModalTask.kpiProgress) : (kpiModalTask.selfKpiProgress ? String(kpiModalTask.selfKpiProgress) : "100"),
                        kpiQuality: kpiModalTask.kpiQuality ? String(kpiModalTask.kpiQuality) : (kpiModalTask.selfKpiQuality ? String(kpiModalTask.selfKpiQuality) : "100"),
                        kpiComment: kpiModalTask.kpiComment || "",
                        directorEvidence: "",
                      });
                    }}
                    className={`flex-1 py-1.5 rounded-lg transition ${
                      kpiModalMode === "DEPT_HEAD" ? "bg-white text-purple-800 shadow-sm" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    2. Phụ trách BP duyệt
                  </button>
                )}
                {canExecutiveAdjustKpi(currentUser) && (
                  <button
                    type="button"
                    onClick={() => {
                      setKpiModalMode("DIRECTOR_ADJUST");
                      setKpiFormData({
                        kpiQuantity: kpiModalTask.kpiQuantity ? String(kpiModalTask.kpiQuantity) : "100",
                        kpiProgress: kpiModalTask.kpiProgress ? String(kpiModalTask.kpiProgress) : "100",
                        kpiQuality: kpiModalTask.kpiQuality ? String(kpiModalTask.kpiQuality) : "100",
                        kpiComment: kpiModalTask.directorComment || kpiModalTask.kpiComment || "",
                        directorEvidence: kpiModalTask.directorEvidence || "",
                      });
                    }}
                    className={`flex-1 py-1.5 rounded-lg transition ${
                      kpiModalMode === "DIRECTOR_ADJUST" ? "bg-white text-rose-800 shadow-sm" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    3. BGD điều chỉnh
                  </button>
                )}
              </div>
            )}

            {/* Thông tin công việc */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-1 text-xs text-gray-800">
              <p>
                <strong>Công việc:</strong> <span className="font-mono font-bold">[{kpiModalTask.code}]</span> {kpiModalTask.title}
              </p>
              <p>
                <strong>Người làm:</strong> {kpiModalTask.assignee.fullName} {kpiModalTask.assignee.department ? `(BP ${kpiModalTask.assignee.department})` : ""}
              </p>
              <p>
                <strong>Hạn hoàn thành:</strong> {formatDate(kpiModalTask.deadline)}
              </p>
              {kpiModalTask.evidenceSource && (
                <p>
                  <strong>Nguồn kiểm chứng:</strong> <span className="text-blue-800">{kpiModalTask.evidenceSource}</span>
                </p>
              )}
              {parseEvidenceFiles(kpiModalTask.evidenceFiles).length > 0 && (
                <div className="pt-1 flex flex-wrap gap-1.5">
                  {parseEvidenceFiles(kpiModalTask.evidenceFiles).map((f, idx) => (
                    <a
                      key={idx}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold text-[11px] shadow-sm transition"
                    >
                      <Paperclip className="w-3 h-3" /> {f.name}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Thẻ hiển thị điểm tự chấm của cá nhân (khi Phụ trách BP hoặc BGD đang xem) */}
            {kpiModalMode !== "SELF" && kpiModalTask.selfKpiScore !== null && kpiModalTask.selfKpiScore !== undefined && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-amber-900 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-600" /> KẾT QUẢ CÁ NHÂN TỰ CHẤM:
                  </span>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-lg font-black text-xs">
                    {kpiModalTask.selfKpiScore}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px] text-amber-950 font-semibold bg-white/80 p-1.5 rounded-lg border border-amber-100 text-center">
                  <div>SL: {kpiModalTask.selfKpiQuantity}đ</div>
                  <div>TĐ: {kpiModalTask.selfKpiProgress}đ</div>
                  <div>CL: {kpiModalTask.selfKpiQuality}đ</div>
                </div>
                {kpiModalTask.selfKpiComment && (
                  <p className="italic text-amber-900 text-[11px]">"{kpiModalTask.selfKpiComment}"</p>
                )}
                {kpiModalMode === "DEPT_HEAD" && (
                  <button
                    type="button"
                    onClick={() => {
                      setKpiFormData((prev) => ({
                        ...prev,
                        kpiQuantity: String(kpiModalTask.selfKpiQuantity ?? 100),
                        kpiProgress: String(kpiModalTask.selfKpiProgress ?? 100),
                        kpiQuality: String(kpiModalTask.selfKpiQuality ?? 100),
                        kpiComment: prev.kpiComment || kpiModalTask.selfKpiComment || "Đồng ý với điểm tự chấm của viên chức",
                      }));
                    }}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                  >
                    👉 Áp dụng nhanh điểm tự chấm của nhân viên
                  </button>
                )}
              </div>
            )}

            {kpiFormError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {kpiFormError}
              </div>
            )}

            <form onSubmit={handleSaveKpi} className="space-y-4 text-xs">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-800 uppercase text-[11px]">1. SỐ LƯỢNG (0 — 100) *</label>
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
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm focus:bg-white"
                    placeholder="Điểm số lượng (0 - 100)"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Mức độ hoàn thành khối lượng / sản lượng công việc</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-800 uppercase text-[11px]">2. TIẾN ĐỘ (0 — 100) *</label>
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
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm focus:bg-white"
                    placeholder="Điểm tiến độ (0 - 100)"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Mức độ hoàn thành công việc đúng thời hạn</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-800 uppercase text-[11px]">3. CHẤT LƯỢNG (0 — 100) *</label>
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
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm focus:bg-white"
                    placeholder="Điểm chất lượng (0 - 100)"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Mức độ đáp ứng yêu cầu kỹ thuật và chất lượng đầu ra</p>
                </div>
              </div>

              {/* KPI Tổng tính tự động */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  kpiModalMode === "SELF"
                    ? "bg-amber-100/70 border-amber-200"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "bg-rose-100/70 border-rose-200"
                    : "bg-purple-100/70 border-purple-200"
                }`}
              >
                <span className="font-black uppercase text-xs">
                  {kpiModalMode === "SELF"
                    ? "ĐIỂM TỰ CHẤM TỔNG HỢP:"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "ĐIỂM BGD ĐIỀU CHỈNH TỔNG:"
                    : "ĐIỂM KPI CHÍNH THỨC TỔNG:"}
                </span>
                <span className="font-black text-lg">
                  {(() => {
                    const q = parseFloat(kpiFormData.kpiQuantity);
                    const p = parseFloat(kpiFormData.kpiProgress);
                    const l = parseFloat(kpiFormData.kpiQuality);
                    if (
                      !isNaN(q) && q >= 0 && q <= 100 &&
                      !isNaN(p) && p >= 0 && p <= 100 &&
                      !isNaN(l) && l >= 0 && l <= 100
                    ) {
                      return `${Number(((q + p + l) / 3).toFixed(2))}%`;
                    }
                    return "--%";
                  })()}
                </span>
              </div>

              {/* BẮT BUỘC: Nhập bằng chứng cụ thể khi Ban Giám đốc điều chỉnh */}
              {kpiModalMode === "DIRECTOR_ADJUST" && (
                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-rose-900 uppercase text-[11px]">
                      BẰNG CHỨNG CỤ THỂ KIỂM CHỨNG (BẮT BUỘC) *
                    </label>
                    <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-black">
                      Yêu cầu kiểm chứng
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    required
                    value={kpiFormData.directorEvidence}
                    onChange={(e) => setKpiFormData({ ...kpiFormData, directorEvidence: e.target.value })}
                    placeholder="VD: Biên bản kiểm tra chuyên môn số 15/BB-TYT ngày 03/11/2026; Đối soát số lượt khám trên cổng BHYT/HIS phát hiện thiếu hồ sơ bệnh án..."
                    className="w-full p-2.5 bg-white border border-rose-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-rose-500"
                  />
                  <p className="text-[10px] text-rose-700">
                    Ban Giám đốc chỉ được đề nghị điều chỉnh khi có căn cứ, văn bản hoặc số liệu kiểm chứng xác thực.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  {kpiModalMode === "SELF"
                    ? "Ý kiến tự nhận xét của cá nhân:"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "Ý kiến chỉ đạo / Căn cứ của Ban Giám đốc:"
                    : "Nhận xét của Phụ trách bộ phận:"}
                </label>
                <textarea
                  rows={2}
                  value={kpiFormData.kpiComment}
                  onChange={(e) => setKpiFormData({ ...kpiFormData, kpiComment: e.target.value })}
                  placeholder="Nhập nhận xét / ghi chú đánh giá..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white"
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
                  className={`px-5 py-2 font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center gap-1.5 text-white ${
                    kpiModalMode === "SELF"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : kpiModalMode === "DIRECTOR_ADJUST"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  <Award className="w-4 h-4" />
                  {isSubmittingKpi
                    ? "Đang lưu..."
                    : kpiModalMode === "SELF"
                    ? "Lưu kết quả tự chấm"
                    : kpiModalMode === "DIRECTOR_ADJUST"
                    ? "BGD xác nhận điều chỉnh kèm bằng chứng"
                    : "Xác nhận duyệt KPI bộ phận"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Phê Duyệt / Từ Chối Nhiệm Vụ Đột Xuất */}
      {approvalModalTask && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setApprovalModalTask(null);
          }}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative my-auto">
            <button
              onClick={() => setApprovalModalTask(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div
                className={`p-2.5 rounded-xl ${
                  approvalModalAction === "APPROVE"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {approvalModalAction === "APPROVE" ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 uppercase">
                  {approvalModalAction === "APPROVE"
                    ? "PHÊ DUYỆT NHIỆM VỤ ĐỘT XUẤT"
                    : "TỪ CHỐI PHÊ DUYỆT NHIỆM VỤ"}
                </h3>
                <p className="text-xs text-gray-500">
                  {approvalModalAction === "APPROVE"
                    ? "Cho phép viên chức bắt đầu triển khai nhiệm vụ"
                    : "Từ chối và không cho phép triển khai nhiệm vụ"}
                </p>
              </div>
            </div>

            {/* Thông tin nhiệm vụ */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5 text-xs text-gray-800">
              <p>
                <strong>Mã & Tên việc:</strong> <span className="font-mono font-bold">[{approvalModalTask.code}]</span> {approvalModalTask.title}
              </p>
              <p>
                <strong>Viên chức thực hiện:</strong> {approvalModalTask.assignee.fullName} {approvalModalTask.assignee.department ? `(BP ${approvalModalTask.assignee.department})` : ""}
              </p>
              <p>
                <strong>Hạn hoàn thành:</strong> {formatDate(approvalModalTask.deadline)}
              </p>
              {approvalModalTask.taskSource && (
                <p>
                  <strong>Nguồn giao việc:</strong> <span className="text-purple-800 font-semibold">📌 {approvalModalTask.taskSource}</span>
                </p>
              )}
              {approvalModalTask.notes && (
                <p className="italic text-gray-600 bg-white p-2 rounded border border-gray-100 mt-1">
                  "{approvalModalTask.notes}"
                </p>
              )}
            </div>

            {approvalError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                {approvalError}
              </div>
            )}

            <form onSubmit={handleConfirmApproval} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  {approvalModalAction === "APPROVE"
                    ? "Ý kiến chỉ đạo / Nhận xét phê duyệt:"
                    : "Lý do từ chối phê duyệt (bắt buộc):"}
                </label>
                <textarea
                  rows={3}
                  required={approvalModalAction === "REJECT"}
                  value={approvalModalNote}
                  onChange={(e) => setApprovalModalNote(e.target.value)}
                  placeholder={
                    approvalModalAction === "APPROVE"
                      ? "Ghi chú phê duyệt hoặc giao nhiệm vụ chi tiết..."
                      : "Nêu rõ lý do từ chối để viên chức nắm được..."
                  }
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setApprovalModalTask(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingApproval}
                  className={`px-5 py-2 font-bold rounded-xl shadow-md disabled:opacity-50 flex items-center gap-1.5 text-white ${
                    approvalModalAction === "APPROVE"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {approvalModalAction === "APPROVE" ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                  {isSubmittingApproval
                    ? "Đang xử lý..."
                    : approvalModalAction === "APPROVE"
                    ? "Xác Nhận Phê Duyệt"
                    : "Xác Nhận Từ Chối"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
