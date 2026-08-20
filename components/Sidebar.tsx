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
} from "lucide-react";

interface SidebarProps {
  role?: "ADMIN" | "USER";
}

export function Sidebar({ role = "USER" }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: false },
    { label: "Công việc", href: "/tasks", icon: CheckSquare, adminOnly: false },
    { label: "Lịch deadline", href: "/calendar", icon: Calendar, adminOnly: false },
    { label: "Nhân sự", href: "/users", icon: Users, adminOnly: true },
    { label: "Báo cáo & Export", href: "/reports", icon: BarChart3, adminOnly: true },
    { label: "Thông báo & Log", href: "/notifications", icon: Bell, adminOnly: false },
    { label: "Cấu hình", href: "/settings", icon: Settings, adminOnly: true },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col min-h-[calc(100vh-4rem)] p-4 shadow-sm">
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          if (item.adminOnly && role !== "ADMIN") return null;

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
        <p className="text-[11px] text-gray-400">QLCV V1.2 &bull; Enterprise Task Engine</p>
      </div>
    </aside>
  );
}
