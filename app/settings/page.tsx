"use client";

import { useState, useEffect } from "react";
import { Settings, Save, BellRing, Mail, MessageSquare, Calendar, CheckCircle, Database } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);

  const [settings, setSettings] = useState({
    priorityLowHours: 4,
    priorityMediumHours: 24,
    priorityHighHours: 48,
    enableEmail: true,
    enableZalo: true,
    enablePush: true,
    googleCalendarEnabled: true,
  });

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
  }, []);

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

            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
              <div className="flex items-center gap-3">
                <BellRing className="w-5 h-5 text-emerald-600" />
                <div>
                  <span className="font-bold text-gray-900 block">Web Push (PWA Push API)</span>
                  <span className="text-gray-500 text-[11px]">Bắn thông báo đẩy ra màn hình máy tính/điện thoại</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enablePush}
                onChange={(e) => setSettings({ ...settings, enablePush: e.target.checked })}
                className="w-5 h-5 text-blue-600 rounded"
              />
            </label>
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

        {/* 4. Standard Task Catalog Management (Pilot Dân số) */}
        <section className="bg-white p-6 rounded-2xl border border-blue-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-blue-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-gray-900 text-base">Khung Danh Mục Công Việc Chuẩn (Pilot Vị Trí Dân Số)</h2>
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

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100">
              <span className="text-[11px] text-blue-800 font-bold block uppercase">Vị trí thí điểm</span>
              <span className="text-sm font-black text-blue-950 mt-0.5 block">Vị trí Dân số (VT-DAN-SO)</span>
              <span className="text-[10px] text-blue-600 font-medium">Sẵn sàng mở rộng 21 vị trí tiếp theo</span>
            </div>
            <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100">
              <span className="text-[11px] text-indigo-800 font-bold block uppercase">Nhóm công việc</span>
              <span className="text-sm font-black text-indigo-950 mt-0.5 block">3 nhóm (25% - 45% - 30%)</span>
              <span className="text-[10px] text-indigo-600 font-medium">Tổng trọng số = 100%</span>
            </div>
            <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
              <span className="text-[11px] text-emerald-800 font-bold block uppercase">Công việc chuẩn</span>
              <span className="text-sm font-black text-emerald-950 mt-0.5 block">14 sản phẩm / công việc</span>
              <span className="text-[10px] text-emerald-600 font-medium">Mức N1 (x1.00) &rarr; N5 (x2.50)</span>
            </div>
          </div>
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
