import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// Thời gian (audit H7): toàn bộ ứng dụng quy ước theo giờ Việt Nam
// (Asia/Ho_Chi_Minh, UTC+7, không có DST). Deadline lưu UTC instant;
// mọi chuỗi naive "YYYY-MM-DDTHH:mm" từ client được hiểu là GIỜ VIỆT NAM,
// KHÔNG phụ thuộc timezone của server/browser.
// ============================================================
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";
export const APP_UTC_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, không DST

const pad2 = (n: number) => String(n).padStart(2, "0");

function vnParts(d: Date) {
  const v = new Date(d.getTime() + APP_UTC_OFFSET_MS);
  return {
    y: v.getUTCFullYear(),
    m: v.getUTCMonth(),
    day: v.getUTCDate(),
    h: v.getUTCHours(),
    min: v.getUTCMinutes(),
    s: v.getUTCSeconds(),
    ms: v.getUTCMilliseconds(),
  };
}

/** Instant → chuỗi naive "YYYY-MM-DDTHH:mm" theo giờ Việt Nam (điền datetime-local). */
export function toLocalInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const p = vnParts(date);
  return `${p.y}-${pad2(p.m + 1)}-${pad2(p.day)}T${pad2(p.h)}:${pad2(p.min)}`;
}

/**
 * Chuỗi deadline từ client → Date (UTC instant).
 * - Có offset/Z (ISO) → parse trực tiếp.
 * - Naive "YYYY-MM-DDTHH:mm" / "YYYY-MM-DD" → coi là giờ Việt Nam.
 * Trả về null nếu không parse được.
 */
export function fromLocalInputValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const t = new Date(s);
    return isNaN(t.getTime()) ? null : t;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const utc = Date.UTC(
    +m[1],
    +m[2] - 1,
    +m[3],
    +(m[4] ?? 0),
    +(m[5] ?? 0),
    +(m[6] ?? 0)
  );
  if (isNaN(utc)) return null;
  const t = new Date(utc - APP_UTC_OFFSET_MS);
  return isNaN(t.getTime()) ? null : t;
}

/** 00:00:00.000 (giờ Việt Nam) của ngày chứa instant d. */
export function startOfLocalDay(d: Date): Date {
  const p = vnParts(d);
  return new Date(Date.UTC(p.y, p.m, p.day, 0, 0, 0, 0) - APP_UTC_OFFSET_MS);
}

/** 23:59:59.999 (giờ Việt Nam) của ngày chứa instant d. */
export function endOfLocalDay(d: Date): Date {
  return new Date(startOfLocalDay(d).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Khóa ngày "YYYY-MM-DD" theo giờ Việt Nam (dùng cho lịch/highlight "hôm nay"). */
export function localDateKey(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const p = vnParts(date);
  return `${p.y}-${pad2(p.m + 1)}-${pad2(p.day)}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDateOnly(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatPriority(priority: "LOW" | "MEDIUM" | "HIGH"): string {
  switch (priority) {
    case "LOW":
      return "Bình thường";
    case "MEDIUM":
      return "Gấp";
    case "HIGH":
      return "Rất gấp";
    default:
      return priority;
  }
}

export function formatTaskType(taskType: string | null | undefined): string {
  switch (taskType) {
    case "AD_HOC":
      return "Đột xuất";
    case "RECURRING":
      return "Thường xuyên";
    default:
      return taskType || "Thường xuyên";
  }
}

export function formatStatus(status: "TODO" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED"): string {
  switch (status) {
    case "TODO":
      return "Chưa thực hiện";
    case "IN_PROGRESS":
      return "Đang thực hiện";
    case "PAUSED":
      return "Tạm dừng";
    case "COMPLETED":
      return "Hoàn thành";
    case "CANCELLED":
      return "Hủy";
    default:
      return status;
  }
}
