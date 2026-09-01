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

    // Admin-only routes
    if (
      (pathname.startsWith("/users") || pathname.startsWith("/settings")) &&
      role !== "ADMIN"
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
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
