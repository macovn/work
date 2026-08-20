"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ShieldCheck, Send, AlertTriangle, Smartphone, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface InAppAlert {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  taskId: string;
  createdAt: string;
}

interface NotificationLogItem {
  id: string;
  notificationType: string;
  channel: string;
  ruleKey: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: string;
  errorMessage?: string | null;
  user: { fullName: string; email: string };
  task: { code: string; title: string };
}

export default function NotificationsPage() {
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatus, setPushStatus] = useState("");

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.inAppAlerts || []);
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleSubscribePush = async () => {
    setPushStatus("Đang yêu cầu quyền Web Push...");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus("Trình duyệt không hỗ trợ Web Push Notification.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("Bạn đã từ chối quyền Web Push.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      const res = await fetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.toJSON().keys,
        }),
      });

      if (res.ok) {
        setPushSubscribed(true);
        setPushStatus("Đã cấp quyền & đăng ký Web Push thành công!");
      }
    } catch (err: any) {
      setPushStatus(`Lỗi đăng ký Push: ${err?.message || err}`);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Notification Center & Audit Log</h1>
          <p className="text-sm text-gray-500">Trung tâm thông báo In-App và Lịch sử audit hệ thống</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadNotifications}
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" /> Làm mới
          </button>

          <button
            onClick={handleSubscribePush}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5"
          >
            <Smartphone className="w-4 h-4" /> Đăng Ký Web Push
          </button>
        </div>
      </div>

      {pushStatus && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold rounded-xl">
          {pushStatus}
        </div>
      )}

      {/* In-App Notifications List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-3">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-gray-900 text-base">Thông Báo Cá Nhân</h2>
          </div>
          <button
            onClick={markAllAsRead}
            className="text-xs text-blue-600 hover:underline font-bold flex items-center gap-1"
          >
            <CheckCheck className="w-4 h-4" /> Đánh dấu tất cả đã đọc
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-gray-500">Đang tải...</div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">Không có thông báo nào</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {alerts.map((item) => (
              <Link
                key={item.id}
                href={`/tasks?id=${item.taskId}`}
                className={`block p-4 hover:bg-blue-50/50 transition ${
                  !item.isRead ? "bg-blue-50/40 font-semibold" : "bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">{item.title}</h4>
                    <p className="text-xs text-gray-600 mt-1">{item.message}</p>
                    <span className="text-[10px] text-gray-400 mt-1 block">{formatDate(item.createdAt)}</span>
                  </div>
                  {!item.isRead && (
                    <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" title="Chưa đọc" />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Notification Log Audit Table (Admin View) */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-3">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-gray-900 text-base">Notification Audit Log (Dành cho Admin)</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-bold uppercase">
                  <th className="p-3.5">Người nhận</th>
                  <th className="p-3.5">Mã Task</th>
                  <th className="p-3.5">Loại thông báo</th>
                  <th className="p-3.5">Kênh</th>
                  <th className="p-3.5">Quy tắc (Rule)</th>
                  <th className="p-3.5">Thời gian gửi</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5">Lỗi (nếu có)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-3.5 font-bold text-gray-900">{log.user?.fullName}</td>
                    <td className="p-3.5 font-mono text-blue-600 font-bold">{log.task?.code}</td>
                    <td className="p-3.5 font-semibold text-gray-800">{log.notificationType}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded font-bold uppercase text-[10px]">
                        {log.channel}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-gray-600">{log.ruleKey}</td>
                    <td className="p-3.5 text-gray-600">{log.sentAt ? formatDate(log.sentAt) : "N/A"}</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          log.status === "SENT" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-red-600 max-w-xs truncate">{log.errorMessage || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
