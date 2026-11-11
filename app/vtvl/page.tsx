"use client";

import { useEffect, useState, useMemo } from "react";
import {
  TYT_CAI_BAU_SUMMARY,
  TYT_MISSIONS_A1,
  TYT_VTVL_POSITIONS,
  TYT_STAFF_D1,
  QD1399_22_POSITIONS_REFERENCE,
} from "@/lib/tyt-caibau-data";
import {
  Briefcase,
  Users,
  Clock,
  TrendingDown,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Download,
  Search,
  Building2,
  FileSpreadsheet,
  Award,
  Layers,
  Edit3,
  Save,
  X,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatWorkLocation } from "@/lib/utils";
import { canViewVtvlAndReports, isLeadership } from "@/lib/permissions";

export default function VtvlPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"C1_C3" | "A1_B1_B2" | "D1_STAFF" | "QD1399">("C1_C3");

  // Live DB state for StandardTasks & Positions
  const [dbPositions, setDbPositions] = useState<any[]>([]);
  const [dbStandardTasks, setDbStandardTasks] = useState<any[]>([]);
  const [syncingSeed, setSyncingSeed] = useState(false);

  // Filters for Tab D1
  const [staffSearch, setStaffSearch] = useState("");
  const [staffLocationFilter, setStaffLocationFilter] = useState("");
  const [staffVtvlFilter, setStaffVtvlFilter] = useState("");

  // Filters for Tab B1/B2
  const [workSearch, setWorkSearch] = useState("");
  const [workVtvlFilter, setWorkVtvlFilter] = useState("");

  // Inline edit state for B1/B2 work items
  const [editingTaskCode, setEditingTaskCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    id?: string;
    annualVolume: number;
    standardMinutes: number;
    extraHoursYear: number;
    digitalSavedHours: number;
    benchmarkScore: number;
  }>({
    annualVolume: 0,
    standardMinutes: 0,
    extraHoursYear: 0,
    digitalSavedHours: 0,
    benchmarkScore: 0,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchLiveCatalog = async () => {
    try {
      const [meRes, posRes, stdRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/job-positions"),
        fetch("/api/standard-tasks"),
      ]);
      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData.user);
        if (!canViewVtvlAndReports(meData.user?.role)) {
          window.location.href = "/dashboard";
          return;
        }
      }
      if (posRes.ok) {
        const posData = await posRes.json();
        if (Array.isArray(posData)) setDbPositions(posData);
      }
      if (stdRes.ok) {
        const stdData = await stdRes.json();
        if (Array.isArray(stdData)) setDbStandardTasks(stdData);
      }
    } catch (e) {
      console.error("Failed to fetch VTVL live data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveCatalog();
  }, []);

  // Merge static HD07 baseline with any live DB overrides for the 26 core work items (CV.TYT.001..026)
  const coreWorkItems = useMemo(() => {
    const dbByCode = new Map(dbStandardTasks.map((t) => [t.code, t]));
    const items: any[] = [];

    for (const pos of TYT_VTVL_POSITIONS) {
      for (const grp of pos.groups) {
        for (const task of grp.tasks) {
          if (!task.code.startsWith("CV.TYT.")) continue;
          const dbItem = dbByCode.get(task.code);
          const annualVolume = dbItem?.annualVolume ?? task.annualVolume ?? 0;
          const standardMinutes = dbItem?.standardMinutes ?? task.standardMinutes ?? 0;
          const extraHoursYear = dbItem?.extraHoursYear ?? task.extraHoursYear ?? 0;
          const digitalSavedHours = dbItem?.digitalSavedHours ?? task.digitalSavedHours ?? 0;
          const benchmarkScore = dbItem?.benchmarkScore ?? task.benchmarkScore;
          const complexityLevel = dbItem?.complexityLevel ?? task.complexityLevel;
          const conversionFactor = dbItem?.conversionFactor ?? task.conversionFactor;

          const productHours = Number(((annualVolume * standardMinutes) / 60).toFixed(2));
          const b1TotalHours = Number((productHours + extraHoursYear).toFixed(2));
          const netHours = Number((b1TotalHours - digitalSavedHours).toFixed(2));

          items.push({
            id: dbItem?.id,
            code: task.code,
            name: dbItem?.name ?? task.name,
            unit: dbItem?.unit ?? task.unit,
            vtvlCode: pos.code,
            vtvlName: pos.name,
            missionCodeA1: dbItem?.missionCodeA1 ?? task.missionCodeA1,
            productCode: dbItem?.productCode ?? task.productCode,
            annualVolume,
            standardMinutes,
            productHours,
            extraHoursYear,
            b1TotalHours,
            digitalSavedHours,
            netHours,
            benchmarkScore,
            complexityLevel,
            conversionFactor,
            evidenceSource: dbItem?.evidenceSource ?? task.evidenceSource,
          });
        }
      }
    }

    return items.sort((a, b) => a.code.localeCompare(b.code));
  }, [dbStandardTasks]);

  // Recompute 19 VTVL positions table from coreWorkItems so live edits reflect in FTE immediately
  const vtvlTableRows = useMemo(() => {
    const dbPosMap = new Map(dbPositions.map((p) => [p.code, p]));

    return TYT_VTVL_POSITIONS.map((pos) => {
      const posWorkItems = coreWorkItems.filter((w) => w.vtvlCode === pos.code);
      const b1Hours =
        posWorkItems.length > 0
          ? posWorkItems.reduce((sum, w) => sum + w.b1TotalHours, 0)
          : pos.b1Hours;
      const b2SavedHours =
        posWorkItems.length > 0
          ? -posWorkItems.reduce((sum, w) => sum + w.digitalSavedHours, 0)
          : pos.b2SavedHours;
      const netHours = Number((b1Hours + b2SavedHours).toFixed(2));
      const stdHours = pos.standardHoursYear || 1904;
      const fte = Number((netHours / stdHours).toFixed(2));

      const dbPos = dbPosMap.get(pos.code);
      const approvedQuota = dbPos?.approvedQuota ?? pos.approvedQuota;
      const currentHeadcount = dbPos?.currentHeadcount ?? pos.currentHeadcount;
      const liveUsersCount = dbPos?._count?.users ?? currentHeadcount;
      const gap = currentHeadcount - approvedQuota;

      return {
        ...pos,
        dbId: dbPos?.id,
        b1Hours,
        b2SavedHours,
        netHours,
        fte,
        approvedQuota,
        currentHeadcount,
        liveUsersCount,
        gap,
      };
    });
  }, [coreWorkItems, dbPositions]);

  // Aggregate totals
  const totals = useMemo(() => {
    const b1 = vtvlTableRows.reduce((s, r) => s + r.b1Hours, 0);
    const b2 = vtvlTableRows.reduce((s, r) => s + r.b2SavedHours, 0);
    const net = vtvlTableRows.reduce((s, r) => s + r.netHours, 0);
    const fte = Number((net / 1904).toFixed(2));
    const quota = vtvlTableRows.reduce((s, r) => s + r.approvedQuota, 0);
    const current = vtvlTableRows.reduce((s, r) => s + r.currentHeadcount, 0);
    return { b1, b2, net, fte, quota, current, gap: current - quota };
  }, [vtvlTableRows]);

  const filteredWorkItems = useMemo(() => {
    return coreWorkItems.filter((item) => {
      if (workVtvlFilter && item.vtvlCode !== workVtvlFilter) return false;
      if (workSearch) {
        const q = workSearch.toLowerCase();
        return (
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.missionCodeA1 || "").toLowerCase().includes(q) ||
          (item.productCode || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [coreWorkItems, workVtvlFilter, workSearch]);

  const filteredStaff = useMemo(() => {
    return TYT_STAFF_D1.filter((s) => {
      if (staffLocationFilter && s.workLocation !== staffLocationFilter) return false;
      if (staffVtvlFilter && s.vtvlCode !== staffVtvlFilter) return false;
      if (staffSearch) {
        const q = staffSearch.toLowerCase();
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.staffCode.toLowerCase().includes(q) ||
          s.qualification.toLowerCase().includes(q) ||
          s.concurrentRole.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [staffLocationFilter, staffVtvlFilter, staffSearch]);

  const handleStartEdit = (item: any) => {
    setEditingTaskCode(item.code);
    setEditForm({
      id: item.id,
      annualVolume: item.annualVolume,
      standardMinutes: item.standardMinutes,
      extraHoursYear: item.extraHoursYear,
      digitalSavedHours: item.digitalSavedHours,
      benchmarkScore: item.benchmarkScore,
    });
  };

  const handleSaveWorkItem = async () => {
    if (!editForm.id) {
      alert("Vui lòng nhấn 'Đồng bộ Danh mục gốc' trước khi chỉnh sửa trực tiếp trên DB.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch("/api/standard-tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editForm.id,
          annualVolume: Number(editForm.annualVolume),
          standardMinutes: Number(editForm.standardMinutes),
          extraHoursYear: Number(editForm.extraHoursYear),
          digitalSavedHours: Number(editForm.digitalSavedHours),
          benchmarkScore: Number(editForm.benchmarkScore),
        }),
      });
      if (res.ok) {
        setEditingTaskCode(null);
        await fetchLiveCatalog();
      } else {
        const err = await res.json();
        alert(err.error || "Lỗi cập nhật định mức");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSyncCatalog = async () => {
    setSyncingSeed(true);
    try {
      const res = await fetch("/api/standard-tasks/seed", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchLiveCatalog();
        alert(data.message || "Đồng bộ thành công!");
      } else {
        alert(data.error || "Lỗi đồng bộ");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingSeed(false);
    }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: C1 - C3 - D2
    const c3Rows = vtvlTableRows.map((r, idx) => ({
      STT: idx + 1,
      "Mã VTVL (C1)": r.code,
      "Tên Vị trí việc làm & Bậc nghề nghiệp": r.name,
      "Bậc nghề nghiệp (NĐ 232)": r.careerRank,
      "Tỷ lệ cơ cấu (%)": r.targetRatio,
      "Phương pháp (C3)": r.method,
      "Tổng giờ B1 (giờ/năm)": r.b1Hours,
      "Giờ giảm số hóa B2 (giờ/năm)": r.b2SavedHours,
      "Giờ ròng B1-B2 (giờ/năm)": r.netHours,
      "Định mức chuẩn (giờ/năm)": r.standardHoursYear,
      "FTE tính toán (PP2)": r.fte,
      "Nhu cầu định biên C3 (người)": r.approvedQuota,
      "Nhân sự hiện có D1 (người)": r.currentHeadcount,
      "Chênh lệch (Hiện có - Định mức)": r.gap,
      "Thuyết minh phương án bố trí (D2)": r.justification,
    }));
    const wsC3 = XLSX.utils.json_to_sheet(c3Rows);
    XLSX.utils.book_append_sheet(wb, wsC3, "C1_C3_D2_DinhBien_FTE");

    // Sheet 2: A2 - B1 - B2 (26 Công việc)
    const b1Rows = coreWorkItems.map((w, idx) => ({
      STT: idx + 1,
      "Mã CV (A2)": w.code,
      "Mã Nhiệm vụ (A1)": w.missionCodeA1,
      "Mã VTVL": w.vtvlCode,
      "Mã SP chuẩn": w.productCode,
      "Tên công việc & Sản phẩm chuẩn": w.name,
      "Đơn vị tính": w.unit,
      "Điểm chuẩn (QĐ 1399)": w.benchmarkScore,
      "Mức phức tạp": w.complexityLevel,
      "Hệ số quy đổi": w.conversionFactor,
      "Sản lượng năm B1": w.annualVolume,
      "Phút/SP": w.standardMinutes,
      "Giờ theo SP (giờ)": w.productHours,
      "Giờ bổ sung trực/định kỳ (giờ)": w.extraHoursYear,
      "Tổng giờ B1 (giờ)": w.b1TotalHours,
      "Giờ giảm số hóa B2 (giờ)": -w.digitalSavedHours,
      "Giờ ròng thực tế (giờ)": w.netHours,
      "Nguồn kiểm chứng": w.evidenceSource,
    }));
    const wsB1 = XLSX.utils.json_to_sheet(b1Rows);
    XLSX.utils.book_append_sheet(wb, wsB1, "A2_B1_B2_26CongViec");

    // Sheet 3: A1 (25 Nhiệm vụ)
    const a1Rows = TYT_MISSIONS_A1.map((m, idx) => ({
      STT: idx + 1,
      "Mã nhiệm vụ (A1)": m.code,
      "Tên nhiệm vụ theo chức năng": m.name,
      "Cơ quan có thẩm quyền giao": m.authority,
      "Văn bản pháp lý": m.legalBasis,
      "Kỳ số liệu": m.period,
      "Trạng thái": m.status,
      "Ghi chú": m.note,
    }));
    const wsA1 = XLSX.utils.json_to_sheet(a1Rows);
    XLSX.utils.book_append_sheet(wb, wsA1, "A1_25NhiemVu");

    // Sheet 4: D1 (67 Viên chức)
    const d1Rows = TYT_STAFF_D1.map((s) => ({
      STT: s.order,
      "Mã nguồn lực (D1)": s.staffCode,
      "Họ và tên": s.fullName,
      "Mã VTVL xếp theo NĐ 232": s.vtvlCode,
      "Trình độ chuyên môn": s.qualification,
      "Mã ngạch hiện hưởng": s.currentRankCode,
      "Điểm công tác": s.workLocation,
      "Tổng quỹ giờ chuẩn (giờ/năm)": s.totalHours,
      "Giờ thực hiện VTVL chính (giờ)": s.mainHours,
      "Giờ kiêm nhiệm Đảng/Đoàn thể (giờ)": s.concurrentHours,
      "Nhiệm vụ kiêm nhiệm / Ghi chú": s.concurrentRole,
    }));
    const wsD1 = XLSX.utils.json_to_sheet(d1Rows);
    XLSX.utils.book_append_sheet(wb, wsD1, "D1_VienChuc_TYT");

    // Sheet 5: QĐ 1399 (22 VTVL Y tế)
    const qdRows = QD1399_22_POSITIONS_REFERENCE.map((q) => ({
      STT: q.stt,
      "Tên Vị trí việc làm Y tế (QĐ 1399/QĐ-SYT)": q.name,
      "Số lượng nhóm SP chuẩn": q.taskCount,
      "Áp dụng tại TYT Cái Bầu": q.appliedAtTyt ? "Có áp dụng" : "Vị trí tuyến BV/TTYT chuyên sâu",
      "Mã VTVL tương ứng tại TYT": q.vtvlCodes.join(", "),
      "Sản phẩm & Điểm chuẩn tiêu biểu": q.sampleProducts,
    }));
    const wsQD = XLSX.utils.json_to_sheet(qdRows);
    XLSX.utils.book_append_sheet(wb, wsQD, "QD1399_22ViTriYTe");

    XLSX.writeFile(wb, "Bo_Bieu_VTVL_TYT_Cai_Bau_2027_2031_HD07.xlsx");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-700/60 border border-blue-400/30 text-xs font-semibold mb-2">
                <Award className="w-3.5 h-3.5 text-amber-300" />
                Hướng dẫn 07-HD/BTCTW (19/10/2026) &bull; Nghị định 232/2026/NĐ-CP &bull; Quyết định 1399/QĐ-SYT
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Đề án Vị trí việc làm &amp; Định biên FTE — {TYT_CAI_BAU_SUMMARY.unitName}
              </h1>
              <p className="text-sm text-blue-100 mt-1">
                {TYT_CAI_BAU_SUMMARY.period} &bull; Quy mô phục vụ:{" "}
                <strong className="text-white">{TYT_CAI_BAU_SUMMARY.population.toLocaleString("vi-VN")} nhân khẩu</strong>{" "}
                (Trạm chính, Cơ sở Methadone &amp; 04 Điểm trạm)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {user?.role === "ADMIN" && (
                <button
                  onClick={handleSyncCatalog}
                  disabled={syncingSeed}
                  className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/25 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingSeed ? "animate-spin" : ""}`} />
                  {syncingSeed ? "Đang đồng bộ..." : "Đồng bộ Danh mục gốc"}
                </button>
              )}
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Xuất Bộ biểu HD07 (.xlsx)
              </button>
            </div>
          </div>

          {/* 6 KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-200 text-xs">
                <span>Nhiệm vụ &amp; CV (A1/A2)</span>
                <Layers className="w-4 h-4 text-blue-300" />
              </div>
              <p className="text-xl font-bold mt-1">25 NV / 26 CV</p>
              <p className="text-[11px] text-blue-200 mt-0.5">19 VTVL (13 nhóm ngành)</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-200 text-xs">
                <span>Tổng giờ cơ sở (Biểu B1)</span>
                <Clock className="w-4 h-4 text-amber-300" />
              </div>
              <p className="text-xl font-bold mt-1">{totals.b1.toLocaleString("vi-VN")}h</p>
              <p className="text-[11px] text-blue-200 mt-0.5">Giờ SP + Trực 24/24 + Methadone</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-200 text-xs">
                <span>Giảm do CĐS (Biểu B2)</span>
                <TrendingDown className="w-4 h-4 text-emerald-300" />
              </div>
              <p className="text-xl font-bold text-emerald-300 mt-1">{totals.b2.toLocaleString("vi-VN")}h</p>
              <p className="text-[11px] text-blue-200 mt-0.5">HIS, BHYT, HSSKĐT, QLVB</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-200 text-xs">
                <span>Giờ ròng (B1 - B2)</span>
                <Calculator className="w-4 h-4 text-cyan-300" />
              </div>
              <p className="text-xl font-bold mt-1">{totals.net.toLocaleString("vi-VN")}h</p>
              <p className="text-[11px] text-blue-200 mt-0.5">Chuẩn PP2: 1.904 giờ/năm</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-200 text-xs">
                <span>Định biên FTE (Biểu C3)</span>
                <Briefcase className="w-4 h-4 text-purple-300" />
              </div>
              <p className="text-xl font-bold text-amber-300 mt-1">
                {totals.fte} FTE &rarr; {totals.quota}
              </p>
              <p className="text-[11px] text-blue-200 mt-0.5">Phương án trình duyệt: 70 người</p>
            </div>

            <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-200 text-xs">
                <span>Hiện có (Biểu D1/D2)</span>
                <Users className="w-4 h-4 text-rose-300" />
              </div>
              <p className="text-xl font-bold mt-1">
                {totals.current} VC{" "}
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-rose-500/40 text-rose-100">
                  {totals.gap > 0 ? `+${totals.gap}` : totals.gap}
                </span>
              </p>
              <p className="text-[11px] text-blue-200 mt-0.5">Thiếu 03 BS, 01 BS YHDP, 01 KTY</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          <button
            onClick={() => setActiveTab("C1_C3")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "C1_C3"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Briefcase className="w-4 h-4" />
            1. Biểu C1 – C3 – D2: 19 VTVL &amp; Định biên 70 FTE
          </button>

          <button
            onClick={() => setActiveTab("A1_B1_B2")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "A1_B1_B2"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Clock className="w-4 h-4" />
            2. Biểu A1 – A2 – B1 – B2: 26 Công việc &amp; Quy đổi giờ (133.560h)
          </button>

          <button
            onClick={() => setActiveTab("D1_STAFF")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "D1_STAFF"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Users className="w-4 h-4" />
            3. Biểu D1: Danh sách {TYT_STAFF_D1.length} Viên chức &amp; Quỹ giờ 1.904h
          </button>

          <button
            onClick={() => setActiveTab("QD1399")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "QD1399"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            4. Phụ lục QĐ 1399/QĐ-SYT: 22 VTVL Chuyên ngành Y tế
          </button>
        </div>

        {/* TAB 1: C1 - C3 - D2 */}
        {activeTab === "C1_C3" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  Bảng tổng hợp Danh mục 19 Vị trí việc làm theo Bậc nghề nghiệp &amp; Xác định nhu cầu nhân lực (Biểu C1, C3, D2)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Áp dụng định mức quỹ thời gian làm việc chuẩn PP2 = <strong>1.904 giờ/người/năm</strong> (238 ngày thực làm &times; 8 giờ/ngày theo HD 07-BTCTW)
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                  Đủ định biên: 14 VTVL
                </span>
                <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                  Cần tuyển mới: 03 VTVL (-5 người)
                </span>
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                  Chuẩn hóa bậc: 02 VTVL (+2 người)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-3 font-bold">Mã VTVL (C1)</th>
                    <th className="py-3 px-3 font-bold">Tên Vị trí việc làm &amp; Bậc nghề nghiệp</th>
                    <th className="py-3 px-2 font-bold text-center">Tỷ lệ</th>
                    <th className="py-3 px-2 font-bold text-center">PP tính</th>
                    <th className="py-3 px-3 font-bold text-right">Giờ B1</th>
                    <th className="py-3 px-3 font-bold text-right">Giảm B2</th>
                    <th className="py-3 px-3 font-bold text-right">Giờ ròng</th>
                    <th className="py-3 px-2 font-bold text-right">FTE (PP2)</th>
                    <th className="py-3 px-2 font-bold text-center bg-blue-50/60 text-blue-900">Định mức C3</th>
                    <th className="py-3 px-2 font-bold text-center bg-emerald-50/60 text-emerald-900">Hiện có D1</th>
                    <th className="py-3 px-2 font-bold text-center">Chênh lệch</th>
                    <th className="py-3 px-3 font-bold">Phương án bố trí &amp; Lộ trình 2027–2031 (Biểu D2)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vtvlTableRows.map((row) => (
                    <tr key={row.code} className="hover:bg-gray-50/80 transition">
                      <td className="py-3 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {row.code}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-900">{row.name}</div>
                        <div className="text-[11px] text-gray-500">{row.description}</div>
                      </td>
                      <td className="py-3 px-2 text-center font-semibold text-gray-700">
                        {row.targetRatio}%
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-mono text-[11px]">
                          {row.method}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-800">
                        {row.b1Hours.toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-emerald-600">
                        {row.b2SavedHours.toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900">
                        {row.netHours.toLocaleString("vi-VN")}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-semibold text-indigo-700">
                        {row.fte.toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-blue-700 bg-blue-50/30">
                        {row.approvedQuota}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-emerald-700 bg-emerald-50/30">
                        {row.currentHeadcount}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {row.gap === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                            <CheckCircle2 className="w-3 h-3" /> Đủ
                          </span>
                        ) : row.gap < 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                            <AlertTriangle className="w-3 h-3" /> {row.gap}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                            +{row.gap}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-gray-600 max-w-xs">
                        {row.justification}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-900 text-white font-bold text-xs">
                  <tr>
                    <td colSpan={4} className="py-3.5 px-3 uppercase">
                      Tổng cộng toàn Trạm Y tế Cái Bầu (19 VTVL / 13 nhóm chức danh)
                    </td>
                    <td className="py-3.5 px-3 text-right">{totals.b1.toLocaleString("vi-VN")}h</td>
                    <td className="py-3.5 px-3 text-right text-emerald-300">{totals.b2.toLocaleString("vi-VN")}h</td>
                    <td className="py-3.5 px-3 text-right text-amber-300">{totals.net.toLocaleString("vi-VN")}h</td>
                    <td className="py-3.5 px-2 text-right font-mono">{totals.fte}</td>
                    <td className="py-3.5 px-2 text-center text-amber-300 text-sm">{totals.quota}</td>
                    <td className="py-3.5 px-2 text-center text-emerald-300 text-sm">{totals.current}</td>
                    <td className="py-3.5 px-2 text-center text-rose-300 text-sm">{totals.gap}</td>
                    <td className="py-3.5 px-3 text-[11px] font-normal text-gray-300">
                      Tuyển bổ sung 03 Bác sĩ Bậc 3, 01 BS YHDP Bậc 3, 01 KTY Bậc 3; Chuẩn hóa thăng hạng ĐD &amp; điều tiết Dân số.
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: A1 - A2 - B1 - B2 */}
        {activeTab === "A1_B1_B2" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    Biểu A2 – B1 – B2: Danh mục 26 Công việc chuẩn, Thống kê Sản lượng, Quy đổi Giờ chuẩn &amp; Điểm chuẩn QĐ 1399
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Công thức Biểu B1/B2: <strong>Giờ theo SP = (Sản lượng năm &times; Phút/SP) / 60</strong> &bull;{" "}
                    <strong>Tổng giờ B1 = Giờ theo SP + Giờ bổ sung trực 24/24</strong> &bull;{" "}
                    <strong>Giờ ròng = Tổng giờ B1 - Giờ giảm số hóa B2</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Tìm mã CV.TYT, tên công việc..."
                      value={workSearch}
                      onChange={(e) => setWorkSearch(e.target.value)}
                      className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none w-56"
                    />
                  </div>
                  <select
                    value={workVtvlFilter}
                    onChange={(e) => setWorkVtvlFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white outline-none"
                  >
                    <option value="">Tất cả 19 VTVL</option>
                    {TYT_VTVL_POSITIONS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-3 font-bold">Mã CV (A2)</th>
                      <th className="py-3 px-2 font-bold">Mã VTVL / A1</th>
                      <th className="py-3 px-3 font-bold">Mô tả Công việc &amp; Nguồn kiểm chứng</th>
                      <th className="py-3 px-2 font-bold text-center">ĐVT</th>
                      <th className="py-3 px-2 font-bold text-center bg-purple-50 text-purple-900">Điểm QĐ1399</th>
                      <th className="py-3 px-2 font-bold text-right">Sản lượng B1</th>
                      <th className="py-3 px-2 font-bold text-right">Phút/SP</th>
                      <th className="py-3 px-2 font-bold text-right">Giờ SP</th>
                      <th className="py-3 px-2 font-bold text-right">Giờ trực/BS</th>
                      <th className="py-3 px-2 font-bold text-right bg-amber-50/70 text-amber-900">Tổng B1</th>
                      <th className="py-3 px-2 font-bold text-right text-emerald-700">Giảm B2</th>
                      <th className="py-3 px-2 font-bold text-right bg-blue-50/70 text-blue-900">Giờ ròng</th>
                      {user?.role === "ADMIN" && <th className="py-3 px-2 font-bold text-center">Sửa</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredWorkItems.map((item) => {
                      const isEditing = editingTaskCode === item.code;
                      return (
                        <tr key={item.code} className="hover:bg-gray-50/80 transition">
                          <td className="py-3 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {item.code}
                            <div className="text-[10px] text-gray-400 font-normal">{item.productCode}</div>
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-semibold text-[11px]">
                              {item.vtvlCode}
                            </span>
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{item.missionCodeA1}</div>
                          </td>
                          <td className="py-3 px-3 max-w-md">
                            <div className="font-semibold text-gray-900 leading-snug">{item.name}</div>
                            <div className="text-[11px] text-gray-500 mt-1">
                              <strong>Minh chứng:</strong> {item.evidenceSource}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center text-gray-700 font-medium">{item.unit}</td>
                          <td className="py-3 px-2 text-center bg-purple-50/30">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.benchmarkScore}
                                onChange={(e) => setEditForm({ ...editForm, benchmarkScore: Number(e.target.value) })}
                                className="w-14 px-1.5 py-1 border rounded text-center"
                              />
                            ) : (
                              <div>
                                <span className="font-bold text-purple-800">{item.benchmarkScore}đ</span>
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                                  {item.complexityLevel} (&times;{item.conversionFactor})
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.annualVolume}
                                onChange={(e) => setEditForm({ ...editForm, annualVolume: Number(e.target.value) })}
                                className="w-20 px-1.5 py-1 border rounded text-right"
                              />
                            ) : (
                              item.annualVolume.toLocaleString("vi-VN")
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.standardMinutes}
                                onChange={(e) => setEditForm({ ...editForm, standardMinutes: Number(e.target.value) })}
                                className="w-16 px-1.5 py-1 border rounded text-right"
                              />
                            ) : (
                              item.standardMinutes
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-gray-700">
                            {item.productHours.toLocaleString("vi-VN")}
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.extraHoursYear}
                                onChange={(e) => setEditForm({ ...editForm, extraHoursYear: Number(e.target.value) })}
                                className="w-20 px-1.5 py-1 border rounded text-right"
                              />
                            ) : (
                              item.extraHoursYear.toLocaleString("vi-VN")
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-mono font-bold text-amber-900 bg-amber-50/40">
                            {item.b1TotalHours.toLocaleString("vi-VN")}
                          </td>
                          <td className="py-3 px-2 text-right font-mono font-semibold text-emerald-600">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editForm.digitalSavedHours}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, digitalSavedHours: Number(e.target.value) })
                                }
                                className="w-16 px-1.5 py-1 border rounded text-right"
                              />
                            ) : item.digitalSavedHours > 0 ? (
                              `-${item.digitalSavedHours}`
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-mono font-bold text-blue-800 bg-blue-50/40">
                            {item.netHours.toLocaleString("vi-VN")}
                          </td>
                          {user?.role === "ADMIN" && (
                            <td className="py-3 px-2 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={handleSaveWorkItem}
                                    disabled={savingEdit}
                                    className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                    title="Lưu"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingTaskCode(null)}
                                    className="p-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 cursor-pointer"
                                    title="Hủy"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleStartEdit(item)}
                                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                                  title="Chỉnh sửa định mức B1/B2 & Điểm chuẩn"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Biểu A1: 25 Nhiệm vụ */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900">
                  Biểu A1: Danh mục 25 Nhiệm vụ theo chức năng của Trạm Y tế Cái Bầu &amp; Đảng bộ Trạm Y tế
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Căn cứ Thông tư 43/2025/TT-BYT, Thông tư 53/2025/TT-BYT và Quyết định 4703/QĐ-UBND ngày 31/12/2025 của UBND đặc khu Vân Đồn
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">STT</th>
                      <th className="py-2.5 px-3 font-bold">Mã Nhiệm vụ (A1)</th>
                      <th className="py-2.5 px-3 font-bold">Tên nhiệm vụ theo chức năng</th>
                      <th className="py-2.5 px-3 font-bold">Căn cứ pháp lý</th>
                      <th className="py-2.5 px-3 font-bold text-center">Phân loại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {TYT_MISSIONS_A1.map((m, idx) => (
                      <tr key={m.code} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-gray-500 font-medium">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-700 whitespace-nowrap">{m.code}</td>
                        <td className="py-2.5 px-3 font-medium text-gray-900">{m.name}</td>
                        <td className="py-2.5 px-3 text-gray-600">{m.legalBasis}</td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              m.status === "Mới tiếp nhận"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: D1 - 67 STAFF */}
        {activeTab === "D1_STAFF" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  Biểu D1: Danh sách {TYT_STAFF_D1.length} Viên chức hiện có tại Trạm Y tế Cái Bầu &amp; Phân bổ Quỹ giờ 1.904 giờ/năm
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Số liệu chốt thời điểm 30/9/2026 &bull; Phân bổ tại Trạm chính, Cơ sở điều trị Methadone và 04 Điểm trạm
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm họ tên, mã VC, trình độ..."
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none w-56"
                  />
                </div>

                <select
                  value={staffLocationFilter}
                  onChange={(e) => setStaffLocationFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white outline-none"
                >
                  <option value="">Tất cả điểm công tác ({TYT_STAFF_D1.length})</option>
                  <option value="Trạm chính">Trạm chính</option>
                  <option value="Cơ sở Methadone">Cơ sở Methadone</option>
                  <option value="Điểm trạm 1">Điểm trạm 1 (Đoàn Kết)</option>
                  <option value="Điểm trạm 2">Điểm trạm 2 (Hạ Long)</option>
                  <option value="Điểm trạm 3">Điểm trạm 3 (Đài Xuyên)</option>
                  <option value="Điểm trạm 4">Điểm trạm 4 (Vạn Yên)</option>
                </select>

                <select
                  value={staffVtvlFilter}
                  onChange={(e) => setStaffVtvlFilter(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white outline-none"
                >
                  <option value="">Tất cả VTVL</option>
                  {TYT_VTVL_POSITIONS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-3 font-bold">STT</th>
                    <th className="py-3 px-3 font-bold">Mã VC (D1)</th>
                    <th className="py-3 px-3 font-bold">Họ và tên viên chức</th>
                    <th className="py-3 px-3 font-bold">Điểm công tác</th>
                    <th className="py-3 px-3 font-bold">Trình độ &amp; Mã ngạch hiện hưởng</th>
                    <th className="py-3 px-3 font-bold">VTVL xếp theo NĐ 232</th>
                    <th className="py-3 px-2 font-bold text-right">Quỹ giờ</th>
                    <th className="py-3 px-2 font-bold text-right text-blue-700">Giờ VTVL chính</th>
                    <th className="py-3 px-2 font-bold text-right text-amber-700">Giờ kiêm nhiệm</th>
                    <th className="py-3 px-3 font-bold">Nhiệm vụ chuyên môn / Đảng / Đoàn thể kiêm nhiệm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStaff.map((s) => (
                    <tr key={s.staffCode} className="hover:bg-gray-50/80 transition">
                      <td className="py-2.5 px-3 text-gray-500 font-medium">{s.order}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-gray-800 whitespace-nowrap">
                        {s.staffCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-gray-900">{s.fullName}</div>
                        <div className="text-[11px] text-gray-400">{s.email}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium text-[11px]">
                          <Building2 className="w-3 h-3 text-gray-500" />
                          {formatWorkLocation(s.workLocation)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-gray-800">{s.qualification}</div>
                        <div className="text-[10px] font-mono text-gray-500">Mã ngạch: {s.currentRankCode}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-bold text-[11px]">
                          {s.vtvlCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-gray-700">
                        {s.totalHours}h
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-blue-700">
                        {s.mainHours}h
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-amber-700">
                        {s.concurrentHours}h
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-gray-600 max-w-xs">{s.concurrentRole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PHỤ LỤC QĐ 1399/QĐ-SYT (22 VTVL Y TẾ) */}
        {activeTab === "QD1399" && (
          <div className="space-y-6">
            {/* N1-N5 Conversion Table */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl p-5 border border-indigo-100">
              <h3 className="text-sm font-bold text-indigo-950">
                Quy tắc quy đổi Điểm chuẩn &amp; Hệ số phức tạp theo Quyết định số 1399/QĐ-SYT ngày 21/8/2026 của Sở Y tế tỉnh Quảng Ninh
              </h3>
              <p className="text-xs text-indigo-800 mt-1">
                Công thức tính điểm thực hiện công việc (Điều 2 QĐ 1399):{" "}
                <strong>Điểm công việc = Khối lượng hoàn thành &times; Điểm chuẩn &times; Hệ số quy đổi mức độ phức tạp (N1–N5)</strong>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
                {[
                  { level: "N1", factor: "1.00", desc: "Công việc cơ bản, lặp lại theo quy trình chuẩn" },
                  { level: "N2", factor: "1.25", desc: "Công việc chuyên môn thường quy, phối hợp xử lý" },
                  { level: "N3", factor: "1.50", desc: "Công việc chuyên sâu, phân tích, hội chẩn, kế hoạch" },
                  { level: "N4", factor: "2.00", desc: "Kỹ thuật phức tạp, đề án, dự báo, chỉ đạo điều hành" },
                  { level: "N5", factor: "2.50", desc: "Phẫu thuật/thủ thuật đặc biệt, đề án cấp tỉnh/ngành" },
                ].map((item) => (
                  <div key={item.level} className="bg-white rounded-xl p-3 border border-indigo-200/70 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-xs">
                        Mức {item.level}
                      </span>
                      <span className="font-mono font-bold text-indigo-900 text-sm">&times;{item.factor}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 mt-1.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 22 Positions Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">
                  Danh mục đầy đủ 22 Vị trí việc làm Chuyên ngành Y tế (Ban hành kèm theo Quyết định 1399/QĐ-SYT)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Đối chiếu sự tương thích giữa 22 Vị trí chuyên môn của Sở Y tế và 19 VTVL theo Bậc nghề nghiệp tại Trạm Y tế Cái Bầu
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-3 font-bold text-center">Vị trí số</th>
                      <th className="py-3 px-3 font-bold">Tên Vị trí việc làm Y tế (QĐ 1399/QĐ-SYT)</th>
                      <th className="py-3 px-2 font-bold text-center">Trang PDF</th>
                      <th className="py-3 px-2 font-bold text-center">Số SP chuẩn</th>
                      <th className="py-3 px-3 font-bold text-center">Áp dụng tại TYT Cái Bầu</th>
                      <th className="py-3 px-3 font-bold">Mã VTVL NĐ 232 tương ứng</th>
                      <th className="py-3 px-3 font-bold">Sản phẩm &amp; Điểm chuẩn tiêu biểu (N1–N5)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {QD1399_22_POSITIONS_REFERENCE.map((q) => (
                      <tr key={q.stt} className="hover:bg-gray-50/80">
                        <td className="py-3 px-3 text-center font-bold text-gray-700">{q.stt}</td>
                        <td className="py-3 px-3 font-bold text-gray-900">{q.name}</td>
                        <td className="py-3 px-2 text-center text-gray-500">Tr. {q.page}</td>
                        <td className="py-3 px-2 text-center font-semibold text-blue-700">{q.taskCount} SP</td>
                        <td className="py-3 px-3 text-center">
                          {q.appliedAtTyt ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              Đang bố trí tại TYT
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium text-[11px]">
                              Tuyến BV / Trung tâm
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] font-semibold text-blue-700">
                          {q.vtvlCodes.length > 0 ? q.vtvlCodes.join(", ") : "—"}
                        </td>
                        <td className="py-3 px-3 text-gray-600">{q.sampleProducts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
