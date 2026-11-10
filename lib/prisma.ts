import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Fallback cục bộ chỉ dành cho dev (serve_app.ts / script chạy trên 127.0.0.1:54332).
// Production BẮT BUỘC cấu hình DATABASE_URL — fail nhanh (throw) thay vì âm thầm trỏ về localhost.
const LOCAL_DEV_DB_URL = "postgresql://postgres:acceptancetest@127.0.0.1:54332/postgres?schema=public";

function formatDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    // Tự động tối ưu kết nối cho Neon Database trên Vercel / serverless
    if (url.hostname.endsWith(".neon.tech")) {
      // 1. Tự động dùng connection pooler (-pooler) cho Serverless runtime nếu chưa có
      if (!url.hostname.includes("-pooler")) {
        const parts = url.hostname.split(".");
        parts[0] = `${parts[0]}-pooler`;
        url.hostname = parts.join(".");
      }
      // 2. Tăng connect_timeout lên 30s để chờ Neon compute khởi động khi cold-start
      if (!url.searchParams.has("connect_timeout")) {
        url.searchParams.set("connect_timeout", "30");
      }
      // 3. Đảm bảo pool_timeout 30s
      if (!url.searchParams.has("pool_timeout")) {
        url.searchParams.set("pool_timeout", "30");
      }
      // 4. Đảm bảo sslmode=require
      if (!url.searchParams.has("sslmode")) {
        url.searchParams.set("sslmode", "require");
      }
      // 5. Đánh dấu pgbouncer=true để Prisma tương thích tốt với PgBouncer transaction mode
      if (!url.searchParams.has("pgbouncer")) {
        url.searchParams.set("pgbouncer", "true");
      }
      return url.toString();
    }
  } catch {
    // URL không hợp lệ thì giữ nguyên
  }
  return rawUrl;
}

const rawDbUrl = process.env.DATABASE_URL;

if (!rawDbUrl) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[Fatal] DATABASE_URL is not configured in production. Set the DATABASE_URL environment variable before starting the app."
    );
  }
  console.warn(
    "[prisma] DATABASE_URL is not set - falling back to LOCAL dev database at 127.0.0.1:54332 (development only)."
  );
}

const effectiveDbUrl = formatDatabaseUrl(rawDbUrl) || LOCAL_DEV_DB_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: effectiveDbUrl },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
