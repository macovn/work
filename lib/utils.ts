import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return new Intl.DateTimeFormat("vi-VN", {
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
