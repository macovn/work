"use client";

import { useState, useEffect } from "react";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  taskId: string;
  createdAt: string;
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.inAppAlerts || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-blue-600 focus:outline-none rounded-full hover:bg-gray-100"
        title="Thông báo"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="font-semibold text-gray-800 text-sm">Thông báo ({unreadCount} chưa đọc)</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Đọc tất cả
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {alerts.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">Không có thông báo nào</div>
            ) : (
              alerts.slice(0, 10).map((item) => (
                <Link
                  key={item.id}
                  href={`/tasks?id=${item.taskId}`}
                  onClick={() => setIsOpen(false)}
                  className={`block p-3 hover:bg-blue-50 transition-colors ${
                    !item.isRead ? "bg-blue-50/50 font-medium" : "bg-white"
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-900 line-clamp-1">{item.title}</p>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.message}</p>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    {new Date(item.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} -{" "}
                    {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </Link>
              ))
            )}
          </div>

          <div className="p-2 text-center bg-gray-50 border-t border-gray-200">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Xem tất cả & Audit Log →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
