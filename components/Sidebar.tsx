"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Users,
  BarChart3,
  Bell,
  Settings,
  Briefcase,
} from "lucide-react";
import { canViewVtvlAndReports, isSystemAdmin, UserRole } from "@/lib/permissions";

interface SidebarProps {
  role?: UserRole | string;
}

export function Sidebar({ role = "USER" }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, visible: true },
    { label: "Công việc & KPI", href: "/tasks", icon: CheckSquare, visible: true },
    {
      label: "Đề án VTVL (HD07)",
      href: "/vtvl",
      icon: Briefcase,
      visible: canViewVtvlAndReports(role),
    },
    { label: "Lịch deadline", href: "/calendar", icon: Calendar, visible: true },
    {
      label: "Nhân sự (67 VC)",
      href: "/users",
      icon: Users,
      visible: isSystemAdmin(role),
    },
    {
      label: "Báo cáo & Export",
      href: "/reports",
      icon: BarChart3,
      visible: canViewVtvlAndReports(role),
    },
    { label: "Nhắc việc - cảnh báo", href: "/notifications", icon: Bell, visible: true },
    {
      label: "Cấu hình & Danh mục",
      href: "/settings",
      icon: Settings,
      visible: isSystemAdmin(role),
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col min-h-[calc(100vh-4rem)] p-4 shadow-sm">
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          if (!item.visible) return null;

          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-gray-400"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-gray-100 text-center">
        <p className="text-[11px] font-semibold text-gray-500">TRẠM Y TẾ CÁI BẦU</p>
        <p className="text-[10px] text-gray-400">HD 07-BTCTW &bull; NĐ 232 &bull; QĐ 1399</p>
      </div>
    </aside>
  );
}
