import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, setAuthCookie } from "@/lib/auth";
import { NotificationEngine } from "@/lib/notification-engine";
import { checkRateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Chống brute-force:
// 1. Tối đa 5 lần thử thất bại trong 5 phút cho mỗi cặp IP + email
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MS = 5 * 60 * 1000;

// 2. Tối đa 15 lần thử thất bại trong 15 phút trên toàn hệ thống cho cùng 1 email (chống distributed brute-force)
const LOGIN_EMAIL_RATE_LIMIT = 15;
const LOGIN_EMAIL_RATE_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email và mật khẩu là bắt buộc" }, { status: 400 });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const clientIp = getClientIp(request);
    const rateLimitIpKey = `login:ip_email:${clientIp}:${normalizedEmail}`;
    const rateLimitEmailKey = `login:email:${normalizedEmail}`;

    const [rateLimitIp, rateLimitEmail] = await Promise.all([
      checkRateLimit(rateLimitIpKey, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS),
      checkRateLimit(rateLimitEmailKey, LOGIN_EMAIL_RATE_LIMIT, LOGIN_EMAIL_RATE_WINDOW_MS),
    ]);

    if (!rateLimitIp.allowed) {
      return NextResponse.json(
        { error: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ${rateLimitIp.retryAfterSec} giây.` },
        { status: 429, headers: { "Retry-After": String(rateLimitIp.retryAfterSec) } }
      );
    }

    if (!rateLimitEmail.allowed) {
      return NextResponse.json(
        { error: `Tài khoản này đang có quá nhiều yêu cầu đăng nhập bất thường. Vui lòng thử lại sau ${rateLimitEmail.retryAfterSec} giây.` },
        { status: 429, headers: { "Retry-After": String(rateLimitEmail.retryAfterSec) } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
    }

    if (user.status === "LOCKED") {
      return NextResponse.json({ error: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin." }, { status: 403 });
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
    }

    // Generate token & set HttpOnly cookie
    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    await setAuthCookie(token);

    // Đăng nhập thành công => reset bộ đếm rate limit
    await Promise.all([
      resetRateLimit(rateLimitIpKey),
      resetRateLimit(rateLimitEmailKey),
    ]);

    // Trigger Login Alert asynchronously (fail-safe)
    NotificationEngine.handleLoginAlert(user.id).catch((err) => {
      console.error("[Login Alert Error]:", err);
    });

    const response = NextResponse.json({
      message: "Đăng nhập thành công",
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("[Login API Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi máy chủ nội bộ" }, { status: 500 });
  }
}
