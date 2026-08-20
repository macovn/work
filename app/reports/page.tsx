import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Download, BarChart2, Users, Layers } from "lucide-react";

export const revalidate = 0;

export default async function ReportsPage() {
  const user = await getCurrentUser();
  const now = new Date();

  const tasks = await prisma.task.findMany({
    include: { assignee: true },
  });

  // Group by Field
  const fieldStats: Record<
    string,
    { total: number; completed: number; inProgress: number; overdue: number }
  > = {};

  // Group by User
  const userStats: Record<
    string,
    { name: string; email: string; total: number; completed: number; inProgress: number; overdue: number }
  > = {};

  for (const t of tasks) {
    const field = t.field || "Khác";
    if (!fieldStats[field]) {
      fieldStats[field] = { total: 0, completed: 0, inProgress: 0, overdue: 0 };
    }
    fieldStats[field].total += 1;
    if (t.status === "COMPLETED") fieldStats[field].completed += 1;
    if (t.status === "IN_PROGRESS") fieldStats[field].inProgress += 1;
    if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < now) {
      fieldStats[field].overdue += 1;
    }

    const userId = t.assigneeId;
    const name = t.assignee?.fullName || "Chưa rõ";
    const email = t.assignee?.email || "";
    if (!userStats[userId]) {
      userStats[userId] = { name, email, total: 0, completed: 0, inProgress: 0, overdue: 0 };
    }
    userStats[userId].total += 1;
    if (t.status === "COMPLETED") userStats[userId].completed += 1;
    if (t.status === "IN_PROGRESS") userStats[userId].inProgress += 1;
    if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && new Date(t.deadline) < now) {
      userStats[userId].overdue += 1;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Báo Cáo Tổng Hợp & Export Excel</h1>
          <p className="text-sm text-gray-500">Phân tích hiệu suất theo Lĩnh vực và Nhân sự thực hiện</p>
        </div>

        <a
          href="/api/reports/export"
          download="Bao_Cao_Quan_Ly_Cong_Viec.xlsx"
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition"
        >
          <Download className="w-4 h-4" /> Export Báo Cáo Excel (.xlsx)
        </a>
      </div>

      {/* 1. Báo cáo theo Lĩnh Vực */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-3">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-gray-900 text-base">Báo Cáo Theo Lĩnh Vực</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold uppercase">
                <th className="p-3.5">Lĩnh vực</th>
                <th className="p-3.5">Tổng số CV</th>
                <th className="p-3.5">Hoàn thành</th>
                <th className="p-3.5">Đang thực hiện</th>
                <th className="p-3.5">Quá hạn</th>
                <th className="p-3.5">Tỷ lệ hoàn thành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(fieldStats).map(([field, stat]) => {
                const rate = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
                return (
                  <tr key={field} className="hover:bg-gray-50">
                    <td className="p-3.5 font-bold text-gray-900">{field}</td>
                    <td className="p-3.5 font-semibold text-gray-700">{stat.total}</td>
                    <td className="p-3.5 text-emerald-700 font-bold">{stat.completed}</td>
                    <td className="p-3.5 text-blue-700 font-bold">{stat.inProgress}</td>
                    <td className="p-3.5 text-red-700 font-bold">{stat.overdue}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="font-bold text-gray-800">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Báo cáo theo Nhân Sự */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-3">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-gray-900 text-base">Báo Cáo Theo Nhân Sự</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold uppercase">
                <th className="p-3.5">Nhân sự</th>
                <th className="p-3.5">Email</th>
                <th className="p-3.5">Tổng CV được giao</th>
                <th className="p-3.5">Hoàn thành</th>
                <th className="p-3.5">Đang thực hiện</th>
                <th className="p-3.5">Quá hạn</th>
                <th className="p-3.5">Tỷ lệ hoàn thành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.values(userStats).map((stat, idx) => {
                const rate = stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0;
                return (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-3.5 font-bold text-gray-900">{stat.name}</td>
                    <td className="p-3.5 font-mono text-gray-600">{stat.email}</td>
                    <td className="p-3.5 font-semibold text-gray-700">{stat.total}</td>
                    <td className="p-3.5 text-emerald-700 font-bold">{stat.completed}</td>
                    <td className="p-3.5 text-blue-700 font-bold">{stat.inProgress}</td>
                    <td className="p-3.5 text-red-700 font-bold">{stat.overdue}</td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="font-bold text-gray-800">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
