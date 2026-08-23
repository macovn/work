"use client";

import { useState, useEffect } from "react";
import { NotificationBell } from "./NotificationBell";
import { WorkSummaryModal } from "./WorkSummaryModal";
import { LogOut, User as UserIcon, ShieldCheck, UserCheck, Bell } from "lucide-react";
import { useRouter } from "next/navigation";

interface NavbarProps {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: "ADMIN" | "USER";
  } | null;
}

export function Navbar({ user }: NavbarProps) {
  const router = useRouter();
  const [isWorkSummaryOpen, setIsWorkSummaryOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && user) {
      const justLoggedIn = sessionStorage.getItem("justLoggedIn");
      if (justLoggedIn === "true") {
        setIsWorkSummaryOpen(true);
        sessionStorage.removeItem("justLoggedIn");
      }
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
            Q
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-base leading-tight">Quản Lý Công Việc</h1>
            <span className="text-[11px] text-gray-500 font-medium">Phiên bản V1.2</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <button
                onClick={() => setIsWorkSummaryOpen(true)}
                className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition flex items-center gap-1.5 text-xs font-bold shadow-2xs border border-blue-200 cursor-pointer"
                title="Công việc cần quan tâm"
              >
                <Bell className="w-4 h-4 text-blue-600" />
                <span className="hidden sm:inline">Việc cần quan tâm</span>
              </button>

              <NotificationBell />

              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full">
                {user.role === "ADMIN" ? (
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                ) : (
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                )}
                <span className="text-xs font-semibold text-gray-800">{user.fullName}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    user.role === "ADMIN" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {user.role}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </>
          )}
        </div>
      </header>

      {user && (
        <WorkSummaryModal
          isOpen={isWorkSummaryOpen}
          onClose={() => setIsWorkSummaryOpen(false)}
        />
      )}
    </>
  );
}
