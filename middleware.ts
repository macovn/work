import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretBytes } from "@/lib/jwt-secret";

// Danh sách extension tĩnh được phép truy cập công khai.
// Trước đây dùng `pathname.includes(".")` — điều đó cho phép BẤT KỲ đường dẫn
// nào có dấu chấm đều bỏ qua xác thực (bypass vector). Chỉ cho phép extension tĩnh rõ ràng.
const STATIC_EXTENSIONS = [
  ".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif",
  ".css", ".js", ".map", ".mjs",
  ".txt", ".xml", ".webmanifest", ".json",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
];

function isStaticAsset(pathname: string): boolean {
  const lastSegment = pathname.split("/").pop() || "";
  return STATIC_EXTENSIONS.some((ext) => lastSegment.toLowerCase().endsWith(ext));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    isStaticAsset(pathname)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    const role = payload.role as string;

    // 1. Tuyến đường chỉ dành riêng cho Quản trị viên (Admin)
    const isSystemAdminRoute =
      pathname.startsWith("/users") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/api/settings") ||
      pathname.startsWith("/api/seed");

    if (isSystemAdminRoute && role !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Quản lý API Users: Tạo/Sửa/Xóa chỉ Admin; Xem danh sách (GET) cho phép cấp quản lý
    if (pathname.startsWith("/api/users")) {
      if (request.method !== "GET" && role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
      }
      if (request.method === "GET" && role === "USER") {
        return NextResponse.json({ error: "Forbidden: Access restricted for regular officers" }, { status: 403 });
      }
    }

    // 2. Tuyến đường Đề án VTVL & Báo cáo: Cấm Viên chức (USER), cho phép Admin, Giám đốc, PGĐ, Phụ trách BP
    const isVtvlOrReportsRoute =
      pathname.startsWith("/vtvl") ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/api/reports/export");

    if (isVtvlOrReportsRoute && role === "USER") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden: Access restricted for regular officers" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
