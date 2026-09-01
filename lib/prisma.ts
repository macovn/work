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

export async function ensureStandardTaskSchema() {
  if (isSchemaEnsured) return;
  try {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "StandardTask" LIMIT 1`);
    isSchemaEnsured = true;
  } catch {
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskType') THEN
            CREATE TYPE "TaskType" AS ENUM ('RECURRING', 'AD_HOC');
          END IF;
        END $$;
      `);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskType" "TaskType" NOT NULL DEFAULT 'RECURRING';`);
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComplexityLevel') THEN
            CREATE TYPE "ComplexityLevel" AS ENUM ('N1', 'N2', 'N3', 'N4', 'N5');
          END IF;
        END $$;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "JobPosition" (
          "id" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "order" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "JobPosition_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "JobPosition_code_key" ON "JobPosition"("code");`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "JobTaskGroup" (
          "id" TEXT NOT NULL,
          "positionId" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "weight" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "order" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "JobTaskGroup_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "JobTaskGroup_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "JobPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "JobTaskGroup_positionId_code_key" ON "JobTaskGroup"("positionId", "code");`);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "StandardTask" (
          "id" TEXT NOT NULL,
          "positionId" TEXT NOT NULL,
          "groupId" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "unit" TEXT NOT NULL,
          "benchmarkScore" DOUBLE PRECISION NOT NULL,
          "complexityLevel" "ComplexityLevel" NOT NULL,
          "conversionFactor" DOUBLE PRECISION NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "order" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "StandardTask_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "StandardTask_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "JobPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "StandardTask_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "JobTaskGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StandardTask_code_key" ON "StandardTask"("code");`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "positionId" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "groupId" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "standardTaskId" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "unit" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "benchmarkScore" DOUBLE PRECISION;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "complexityLevel" "ComplexityLevel";`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "conversionFactor" DOUBLE PRECISION;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignedVolume" DOUBLE PRECISION;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedVolume" DOUBLE PRECISION;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignedScore" DOUBLE PRECISION;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedScore" DOUBLE PRECISION;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completionRate" DOUBLE PRECISION;`);
      isSchemaEnsured = true;
    } catch (e) {
      console.error("[ensureStandardTaskSchema fallback error]:", e);
    }
  }
}

export const ensureTaskTypeColumn = ensureStandardTaskSchema;
