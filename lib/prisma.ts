import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Fallback cục bộ chỉ dành cho dev (serve_app.ts / script chấp nhận chạy trên 127.0.0.1:54332).
// Trên production bắt buộc phải cấu hình DATABASE_URL — fail nhanh thay vì âm thầm trỏ về localhost.
const LOCAL_DEV_DB_URL = "postgresql://postgres:acceptancetest@127.0.0.1:54332/postgres?schema=public";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl && process.env.NODE_ENV === "production") {
  console.error("[Database Warning]: DATABASE_URL environment variable is not defined in Production!");
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: dbUrl || LOCAL_DEV_DB_URL },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let isSchemaEnsured = false;

export async function ensureTaskTypeColumn() {
  if (isSchemaEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskType') THEN
          CREATE TYPE "TaskType" AS ENUM ('RECURRING', 'AD_HOC');
        END IF;
      END $$;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskType" "TaskType" NOT NULL DEFAULT 'RECURRING';
    `);
    isSchemaEnsured = true;
  } catch (err) {
    console.error("[ensureTaskTypeColumn Error]:", err);
  }
}
