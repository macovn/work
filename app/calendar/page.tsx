import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { Calendar as CalendarIcon, ArrowRight } from "lucide-react";
import { formatPriority, formatStatus } from "@/lib/utils";

export const revalidate = 0;

export default async function CalendarPage() {
  const user = await getCurrentUser();
  const where = user?.role === "ADMIN" ? {} : { assigneeId: user?.id };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { fullName: true } },
    },
    orderBy: { deadline: "asc" },
  });

  const groupedTasks: Record<string, typeof tasks> = {};
  for (const t of tasks) {
    const d = new Date(t.deadline);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!groupedTasks[dateKey]) groupedTasks[dateKey] = [];
    groupedTasks[dateKey].push(t);
  }

  const sortedDates = Object.keys(groupedTasks).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Lịch Deadline Công Việc</h1>
        <p className="text-sm text-gray-500">Hiển thị trực quan tiến độ và hạn chót hoàn thành các công việc</p>
      </div>

      <div className="space-y-6">
        {sortedDates.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-sm text-gray-500 shadow-sm">
            Chưa có công việc nào trong lịch
          </div>
        ) : (
          sortedDates.map((dateKey) => {
            const dateObj = new Date(dateKey);
            const dateFormatted = dateObj.toLocaleDateString("vi-VN", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });

            const items = groupedTasks[dateKey];
            const isToday = new Date().toISOString().slice(0, 10) === dateKey;

            return (
              <div
                key={dateKey}
                className={`bg-white rounded-2xl border ${
                  isToday ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"
                } shadow-sm overflow-hidden`}
              >
                <div
                  className={`p-3.5 border-b border-gray-100 flex items-center justify-between ${
                    isToday ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    <span className="font-bold text-sm capitalize">{dateFormatted}</span>
                    {isToday && (
                      <span className="bg-white text-blue-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                        Hôm Nay
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold">{items.length} công việc</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {items.map((t) => (
                    <div key={t.id} className="p-4 hover:bg-gray-50 flex items-center justify-between gap-4 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {t.code}
                          </span>
                          <span className="font-bold text-gray-900 text-sm">{t.title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>Người làm: <strong>{t.assignee.fullName}</strong></span>
                          <span>&bull;</span>
                          <span>Lĩnh vực: {t.field}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            t.priority === "HIGH"
                              ? "bg-red-100 text-red-800"
                              : t.priority === "MEDIUM"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {formatPriority(t.priority)}
                        </span>

                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            t.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : t.status === "IN_PROGRESS"
                              ? "bg-blue-100 text-blue-800"
                              : t.status === "PAUSED"
                              ? "bg-gray-100 text-gray-800"
                              : t.status === "CANCELLED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {formatStatus(t.status)}
                        </span>

                        <Link
                          href={`/tasks?id=${t.id}`}
                          className="p-2 bg-gray-100 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-bold transition"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
