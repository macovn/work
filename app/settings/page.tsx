"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, BellRing, Mail, MessageSquare, Calendar, CheckCircle, Database, Plus, Edit3 } from "lucide-react";

const COMPLEXITY_FACTORS: Record<string, number> = {
  N1: 1.0,
  N2: 1.25,
  N3: 1.5,
  N4: 2.0,
  N5: 2.5,
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [settings, setSettings] = useState({
    priorityLowHours: 4,
    priorityMediumHours: 24,
    priorityHighHours: 48,
    enableEmail: true,
    enableZalo: true,
    enablePush: true,
    googleCalendarEnabled: true,
  });

  // Catalog Management State
  const [positions, setPositions] = useState<any[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string>("");
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [standardTasks, setStandardTasks] = useState<any[]>([]);

  // Inline forms for Catalog
  const [posForm, setPosForm] = useState({ id: "", code: "", name: "", description: "", open: false });
  const [grpForm, setGrpForm] = useState({ id: "", code: "", name: "", weight: "25", open: false });
  const [stdForm, setStdForm] = useState({
    id: "",
    code: "",
    name: "",
    unit: "",
    benchmarkScore: "10",
    complexityLevel: "N1",
    open: false,
  });

  const loadCatalog = useCallback(async (posId?: string) => {
    try {
      const [posRes, stdRes] = await Promise.all([
        fetch("/api/job-positions?includeInactive=true"),
        fetch("/api/standard-tasks?includeInactive=true"),
      ]);
      if (posRes.ok) {
        const posData = await posRes.json();
        setPositions(posData || []);
        const activePosId = posId || selectedPositionId || posData?.[0]?.id || "";
        setSelectedPositionId(activePosId);
        const foundPos = (posData || []).find((p: any) => p.id === activePosId);
        setGroups(foundPos?.groups || []);
      }
      if (stdRes.ok) {
        const stdData = await stdRes.json();
        setStandardTasks(stdData || []);
      }
    } catch (e) {
      console.error("[LoadCatalog Error]:", e);
    }
  }, [selectedPositionId]);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setSettings({
            priorityLowHours: data.settings.priorityLowHours,
            priorityMediumHours: data.settings.priorityMediumHours,
            priorityHighHours: data.settings.priorityHighHours,
            enableEmail: data.settings.enableEmail,
            enableZalo: data.settings.enableZalo,
            enablePush: data.settings.enablePush,
            googleCalendarEnabled: data.settings.googleCalendarEnabled,
          });
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));

    loadCatalog();

    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushSubscribed(Boolean(sub)))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const foundPos = positions.find((p) => p.id === selectedPositionId);
    setGroups(foundPos?.groups || []);
    setSelectedGroupId("");
  }, [selectedPositionId, positions]);

  const handleToggleWebPushDevice = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setError("Trình duyệt này không hỗ trợ Web Push API.");
      return;
    }
    setPushBusy(true);
    setError("");
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub && pushSubscribed) {
        await fetch("/api/notifications/push-subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existingSub.endpoint }),
        });
        await existingSub.unsubscribe().catch(() => {});
        setPushSubscribed(false);
        setMessage("Đã hủy đăng ký nhận thông báo đẩy trên thiết bị này.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Bạn cần cấp quyền thông báo (Notification) trên trình duyệt.");
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey || vapidKey.includes("...")) {
        throw new Error("Chưa cấu hình khóa NEXT_PUBLIC_VAPID_PUBLIC_KEY hợp lệ trên môi trường.");
      }

      const sub =
        existingSub ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      const subJson = sub.toJSON();
      const res = await fetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu đăng ký Web Push");

      setPushSubscribed(true);
      setMessage("✓ Thiết bị này đã đăng ký nhận thông báo Web Push thành công!");
    } catch (err: any) {
      setError(err.message || "Lỗi đăng ký Web Push");
    } finally {
      setPushBusy(false);
    }
  };

  const handleSavePosition = async () => {
    setError("");
    try {
      const method = posForm.id ? "PUT" : "POST";
      const res = await fetch("/api/job-positions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(posForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi lưu vị trí");
      setPosForm({ id: "", code: "", name: "", description: "", open: false });
      await loadCatalog(data.id);
      setMessage("Đã lưu Vị trí việc làm thành công!");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveGroup = async () => {
    if (!selectedPositionId) return;
    setError("");
    try {
      const method = grpForm.id ? "PUT" : "POST";
      const res = await fetch("/api/job-task-groups", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...grpForm,
          positionId: selectedPositionId,
          weight: parseFloat(grpForm.weight) || 100,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi lưu nhóm công việc");
      setGrpForm({ id: "", code: "", name: "", weight: "25", open: false });
      await loadCatalog(selectedPositionId);
      setMessage("Đã lưu Nhóm công việc thành công!");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveStandardTask = async () => {
    const targetGroupId = selectedGroupId || groups[0]?.id;
    if (!selectedPositionId || !targetGroupId) {
      setError("Vui lòng chọn Vị trí và Nhóm công việc trước khi thêm Công việc chuẩn.");
      return;
    }
    setError("");
    try {
      const method = stdForm.id ? "PUT" : "POST";
      const res = await fetch("/api/standard-tasks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stdForm,
          positionId: selectedPositionId,
          groupId: targetGroupId,
          benchmarkScore: parseFloat(stdForm.benchmarkScore) || 1,
          conversionFactor: COMPLEXITY_FACTORS[stdForm.complexityLevel] || 1.0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi lưu công việc chuẩn");
      setStdForm({ id: "", code: "", name: "", unit: "", benchmarkScore: "10", complexityLevel: "N1", open: false });
      await loadCatalog(selectedPositionId);
      setMessage("Đã lưu Công việc chuẩn thành công!");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi lưu");

      setMessage("Cấu hình hệ thống đã được cập nhật thành công!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSeedData = async () => {
    if (!window.confirm("Tạo hoặc làm mới 100 công việc mẫu?")) return;

    setSeeding(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo dữ liệu mẫu");
      setMessage("Dữ liệu mẫu đã sẵn sàng: 100 công việc đã được khởi tạo.");
    } catch (err: any) {
      setError(err.message || "Lỗi khi tạo dữ liệu mẫu");
    } finally {
      setSeeding(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn XÓA TẤT CẢ công việc trong hệ thống?")) return;

    setSeeding(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/seed", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi khi xóa dữ liệu mẫu");
      setMessage(data.message || "Đã xóa toàn bộ công việc thành công!");
    } catch (err: any) {
      setError(err.message || "Lỗi khi xóa dữ liệu");
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">Đang tải cấu hình...</div>;
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Cấu Hình Thông Báo & Tích Hợp</h1>
        <p className="text-sm text-gray-500">
          Cấu hình quy tắc cảnh báo cận hạn (X/Y/Z giờ), bật/tắt các kênh thông báo và Google Calendar
        </p>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" /> {message}
        </div>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-2xl">{error}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. Quy tắc cảnh báo Cận Hạn theo Mức độ Ưu tiên */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <BellRing className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-gray-900 text-base">
              Khoảng Thời Gian Cảnh Báo Cận Hạn (Tính theo giờ trước Deadline)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                Bình thường (Low Priority)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.priorityLowHours}
                  onChange={(e) => setSettings({ ...settings, priorityLowHours: parseInt(e.target.value, 10) || 1 })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm"
                />
                <span className="font-semibold text-gray-500">Giờ</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Cảnh báo trước X giờ (Mặc định: 4h)</p>
            </div>

            <div>
              <label className="block font-bold text-amber-700 mb-1">
                Gấp (Medium Priority)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.priorityMediumHours}
                  onChange={(e) => setSettings({ ...settings, priorityMediumHours: parseInt(e.target.value, 10) || 1 })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm"
                />
                <span className="font-semibold text-gray-500">Giờ</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Cảnh báo trước Y giờ (Mặc định: 24h)</p>
            </div>

            <div>
              <label className="block font-bold text-red-700 mb-1">
                Rất gấp (High Priority)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.priorityHighHours}
                  onChange={(e) => setSettings({ ...settings, priorityHighHours: parseInt(e.target.value, 10) || 1 })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-sm"
                />
                <span className="font-semibold text-gray-500">Giờ</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Cảnh báo trước Z giờ (Mặc định: 48h)</p>
            </div>
          </div>
        </div>

        {/* 2. Cấu hình Bật/Tắt Các Kênh Notification */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Mail className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-gray-900 text-base">Bật / Tắt Kênh Thông Báo</h2>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <div>
                  <span className="font-bold text-gray-900 block">Email Notification</span>
                  <span className="text-gray-500 text-[11px]">Gửi email tự động khi cận hạn / quá hạn</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableEmail}
                onChange={(e) => setSettings({ ...settings, enableEmail: e.target.checked })}
                className="w-5 h-5 text-blue-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <div>
                  <span className="font-bold text-gray-900 block">Zalo OA / ZBS Notification</span>
                  <span className="text-gray-500 text-[11px]">Gửi tin nhắn Zalo qua Official Account API</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableZalo}
                onChange={(e) => setSettings({ ...settings, enableZalo: e.target.checked })}
                className="w-5 h-5 text-blue-600 rounded"
              />
            </label>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-3">
                <BellRing className="w-5 h-5 text-emerald-600" />
                <div>
                  <span className="font-bold text-gray-900 block">Web Push (PWA Push API)</span>
                  <span className="text-gray-500 text-[11px]">Bắn thông báo đẩy ra màn hình máy tính/điện thoại</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleWebPushDevice}
                  disabled={pushBusy}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition ${
                    pushSubscribed
                      ? "bg-emerald-100 text-emerald-800 hover:bg-red-100 hover:text-red-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {pushBusy
                    ? "Đang xử lý..."
                    : pushSubscribed
                    ? "✓ Đã bật trên máy này (Bấm để hủy)"
                    : "Đăng ký thiết bị này"}
                </button>
                <input
                  type="checkbox"
                  checked={settings.enablePush}
                  onChange={(e) => setSettings({ ...settings, enablePush: e.target.checked })}
                  className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Google Calendar 1-Way Sync Setting */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-gray-900 text-base">Tích Hợp Google Calendar (Đồng bộ 1 chiều)</h2>
          </div>

          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer text-xs">
            <div>
              <span className="font-bold text-gray-900 block">Tự động đồng bộ Task sang Google Calendar</span>
              <span className="text-gray-500 text-[11px]">
                Khi tạo/sửa Task, tự động tạo/cập nhật Event trên Google Calendar (1 chiều)
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.googleCalendarEnabled}
              onChange={(e) => setSettings({ ...settings, googleCalendarEnabled: e.target.checked })}
              className="w-5 h-5 text-blue-600 rounded"
            />
          </label>
        </div>

        {/* 4. Standard Task Catalog Management (Quản trị Danh mục 21+ Vị trí việc làm) */}
        <section className="bg-white p-6 rounded-2xl border border-blue-200/80 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="font-bold text-gray-900 text-base">
                  Quản Trị Khung Danh Mục Công Việc Chuẩn ({positions.length} Vị trí)
                </h2>
                <p className="text-[11px] text-gray-500">
                  Quản lý Vị trí việc làm, Nhóm công việc (trọng số %) và Sản phẩm chuẩn (N1–N5)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Nạp hoặc làm mới 14 công việc chuẩn cho Vị trí Dân số?")) return;
                setSeeding(true);
                setMessage("");
                setError("");
                try {
                  const res = await fetch("/api/standard-tasks/seed", { method: "POST" });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Không thể nạp danh mục chuẩn");
                  await loadCatalog();
                  setMessage("✓ Đã nạp thành công 14 công việc chuẩn Pilot Dân số (3 nhóm việc, hệ số N1-N5 chuẩn hóa)!");
                } catch (err: any) {
                  setError(err.message || "Lỗi khi nạp danh mục chuẩn");
                } finally {
                  setSeeding(false);
                }
              }}
              disabled={seeding}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition shadow-sm"
            >
              {seeding ? "Đang nạp..." : "Nạp / Khôi phục 14 CV Chuẩn (Dân số)"}
            </button>
          </div>

          {/* 4.1. Chọn / Thêm Vị trí việc làm */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-700 uppercase text-[11px]">
                1. Vị trí việc làm ({positions.length})
              </span>
              <button
                type="button"
                onClick={() => setPosForm({ id: "", code: "", name: "", description: "", open: !posForm.open })}
                className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm vị trí mới
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {positions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPositionId(p.id)}
                  className={`px-3 py-2 rounded-xl border text-left transition flex items-center gap-2 ${
                    selectedPositionId === p.id
                      ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <span>
                    {p.name} <span className="opacity-75 text-[10px]">({p.code})</span>
                  </span>
                  <Edit3
                    className="w-3 h-3 opacity-70 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPosForm({
                        id: p.id,
                        code: p.code,
                        name: p.name,
                        description: p.description || "",
                        open: true,
                      });
                    }}
                  />
                </button>
              ))}
            </div>

            {posForm.open && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">Mã vị trí</label>
                  <input
                    type="text"
                    disabled={Boolean(posForm.id)}
                    placeholder="VD: VT-KE-HOACH"
                    value={posForm.code}
                    onChange={(e) => setPosForm({ ...posForm, code: e.target.value })}
                    className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">Tên vị trí việc làm</label>
                  <input
                    type="text"
                    placeholder="VD: Kế hoạch tổng hợp"
                    value={posForm.name}
                    onChange={(e) => setPosForm({ ...posForm, name: e.target.value })}
                    className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 mb-1">Mô tả</label>
                  <input
                    type="text"
                    placeholder="Mô tả ngắn..."
                    value={posForm.description}
                    onChange={(e) => setPosForm({ ...posForm, description: e.target.value })}
                    className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSavePosition}
                    className="px-3 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs"
                  >
                    Lưu vị trí
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosForm({ id: "", code: "", name: "", description: "", open: false })}
                    className="px-2.5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg text-xs"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4.2. Nhóm công việc & Trọng số (%) */}
          {selectedPositionId && (
            <div className="space-y-2 text-xs pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-700 uppercase text-[11px]">
                  2. Nhóm công việc & Trọng số (Tổng:{" "}
                  {groups.reduce((s, g) => s + (Number(g.weight) || 0), 0)}%)
                </span>
                <button
                  type="button"
                  onClick={() => setGrpForm({ id: "", code: "", name: "", weight: "25", open: !grpForm.open })}
                  className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm nhóm việc
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGroupId("")}
                  className={`px-3 py-1.5 rounded-xl border text-xs transition ${
                    selectedGroupId === ""
                      ? "bg-indigo-600 text-white border-indigo-600 font-bold"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }`}
                >
                  Tất cả nhóm ({groups.length})
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs transition flex items-center gap-2 ${
                      selectedGroupId === g.id
                        ? "bg-indigo-600 text-white border-indigo-600 font-bold"
                        : "bg-indigo-50/60 text-indigo-900 border-indigo-100 hover:bg-indigo-100/70"
                    }`}
                  >
                    <span>
                      {g.name} <strong>({g.weight}%)</strong>
                    </span>
                    <Edit3
                      className="w-3 h-3 opacity-70 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGrpForm({
                          id: g.id,
                          code: g.code,
                          name: g.name,
                          weight: String(g.weight ?? 25),
                          open: true,
                        });
                      }}
                    />
                  </button>
                ))}
              </div>

              {grpForm.open && (
                <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Mã nhóm</label>
                    <input
                      type="text"
                      disabled={Boolean(grpForm.id)}
                      placeholder="VD: GRP-01"
                      value={grpForm.code}
                      onChange={(e) => setGrpForm({ ...grpForm, code: e.target.value })}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Tên nhóm công việc</label>
                    <input
                      type="text"
                      placeholder="Tên nhóm..."
                      value={grpForm.name}
                      onChange={(e) => setGrpForm({ ...grpForm, name: e.target.value })}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Trọng số (%)</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={grpForm.weight}
                      onChange={(e) => setGrpForm({ ...grpForm, weight: e.target.value })}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveGroup}
                      className="px-3 py-2 bg-indigo-600 text-white font-bold rounded-lg text-xs"
                    >
                      Lưu nhóm
                    </button>
                    <button
                      type="button"
                      onClick={() => setGrpForm({ id: "", code: "", name: "", weight: "25", open: false })}
                      className="px-2.5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg text-xs"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4.3. Bảng Danh mục Công việc chuẩn (N1-N5) */}
          {selectedPositionId && (
            <div className="space-y-2 text-xs pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-700 uppercase text-[11px]">
                  3. Danh sách Công việc chuẩn (
                  {
                    standardTasks.filter(
                      (st) =>
                        st.positionId === selectedPositionId &&
                        (!selectedGroupId || st.groupId === selectedGroupId)
                    ).length
                  }{" "}
                  sản phẩm)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setStdForm({
                      id: "",
                      code: "",
                      name: "",
                      unit: "Báo cáo",
                      benchmarkScore: "10",
                      complexityLevel: "N1",
                      open: !stdForm.open,
                    })
                  }
                  className="text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm công việc chuẩn
                </button>
              </div>

              {stdForm.open && (
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Mã CV chuẩn</label>
                    <input
                      type="text"
                      disabled={Boolean(stdForm.id)}
                      placeholder="VD: DS-15"
                      value={stdForm.code}
                      onChange={(e) => setStdForm({ ...stdForm, code: e.target.value })}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Tên sản phẩm / CV chuẩn</label>
                    <input
                      type="text"
                      placeholder="Tên sản phẩm..."
                      value={stdForm.name}
                      onChange={(e) => setStdForm({ ...stdForm, name: e.target.value })}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Đơn vị tính</label>
                    <input
                      type="text"
                      placeholder="Báo cáo / Bộ..."
                      value={stdForm.unit}
                      onChange={(e) => setStdForm({ ...stdForm, unit: e.target.value })}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 mb-1">Điểm chuẩn & Mức</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min="1"
                        value={stdForm.benchmarkScore}
                        onChange={(e) => setStdForm({ ...stdForm, benchmarkScore: e.target.value })}
                        className="w-16 p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold"
                      />
                      <select
                        value={stdForm.complexityLevel}
                        onChange={(e) => setStdForm({ ...stdForm, complexityLevel: e.target.value })}
                        className="flex-1 p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold"
                      >
                        {Object.entries(COMPLEXITY_FACTORS).map(([lv, f]) => (
                          <option key={lv} value={lv}>
                            {lv} (x{f})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleSaveStandardTask}
                      className="px-3 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs"
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setStdForm({ ...stdForm, open: false })}
                      className="px-2.5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg text-xs"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-600 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Mã</th>
                      <th className="py-2 px-3">Tên công việc chuẩn</th>
                      <th className="py-2 px-3">Nhóm</th>
                      <th className="py-2 px-3">ĐVT</th>
                      <th className="py-2 px-3 text-right">Điểm chuẩn</th>
                      <th className="py-2 px-3 text-center">Mức (Hệ số)</th>
                      <th className="py-2 px-3 text-right">Sửa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {standardTasks
                      .filter(
                        (st) =>
                          st.positionId === selectedPositionId &&
                          (!selectedGroupId || st.groupId === selectedGroupId)
                      )
                      .map((st) => (
                        <tr key={st.id} className="hover:bg-gray-50/80">
                          <td className="py-2 px-3 font-bold text-blue-700">{st.code}</td>
                          <td className="py-2 px-3 font-medium text-gray-900">{st.name}</td>
                          <td className="py-2 px-3 text-gray-500">
                            {st.group?.name} ({st.group?.weight}%)
                          </td>
                          <td className="py-2 px-3 text-gray-600">{st.unit}</td>
                          <td className="py-2 px-3 text-right font-bold">{st.benchmarkScore}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold text-[10px]">
                              {st.complexityLevel} (x{st.conversionFactor})
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGroupId(st.groupId);
                                setStdForm({
                                  id: st.id,
                                  code: st.code,
                                  name: st.name,
                                  unit: st.unit,
                                  benchmarkScore: String(st.benchmarkScore),
                                  complexityLevel: st.complexityLevel,
                                  open: true,
                                });
                              }}
                              className="text-blue-600 hover:underline font-bold"
                            >
                              Sửa
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-violet-600" />
            <h2 className="font-bold text-gray-900 text-base">Dữ liệu mẫu</h2>
          </div>
          <p className="text-xs text-gray-500">
            Tạo hoặc làm mới 100 công việc mẫu để kiểm thử hệ thống. Chỉ quản trị viên có thể thực hiện thao tác này.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSeedData}
              disabled={seeding}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-xl disabled:opacity-50"
            >
              {seeding ? "Đang xử lý..." : "Tạo 100 dữ liệu mẫu"}
            </button>
            <button
              type="button"
              onClick={handleClearData}
              disabled={seeding}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl disabled:opacity-50"
            >
              {seeding ? "Đang xử lý..." : "Xóa tất cả công việc"}
            </button>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Đang lưu..." : "Lưu Cấu Hình"}
          </button>
        </div>
      </form>
    </div>
  );
}
