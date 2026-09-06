import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Fallback cục bộ chỉ dành cho dev (serve_app.ts / script chạy trên 127.0.0.1:54332).
// Production BẮT BUỘC cấu hình DATABASE_URL — fail nhanh (throw) thay vì âm thầm trỏ về localhost.
const LOCAL_DEV_DB_URL = "postgresql://postgres:acceptancetest@127.0.0.1:54332/postgres?schema=public";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  if (process.env.NODE_ENV === "production") {
    // Audit fix H2: thiếu DATABASE_URL ở production phải dừng ứng dụng rõ ràng.
    // Trước đây fallback về DB localhost có mật khẩu mặc định => toàn bộ query chết im lặng
    // trên serverless và credential bị đóng vào bundle server.
    throw new Error(
      "[Fatal] DATABASE_URL is not configured in production. Set the DATABASE_URL environment variable before starting the app."
    );
  }
  console.warn(
    "[prisma] DATABASE_URL is not set - falling back to LOCAL dev database at 127.0.0.1:54332 (development only)."
  );
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: dbUrl || LOCAL_DEV_DB_URL },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
