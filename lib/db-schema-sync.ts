import { prisma } from "./prisma";

let isSchemaEnsured = false;
let isEnsuring = false;

/**
 * Tự động đảm bảo schema cơ sở dữ liệu trên Neon/PostgreSQL luôn có đầy đủ
 * các cột và enum mới nhất, bảo vệ hệ thống khỏi lỗi P2022 (missing column)
 * khi chạy trên môi trường serverless/Vercel.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  if (isSchemaEnsured || isEnsuring) return;
  isEnsuring = true;

  try {
    // 1. Cột mở rộng trên User (đặc biệt là 'department')
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffCode" TEXT;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "positionId" TEXT;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "qualification" TEXT;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workLocation" TEXT DEFAULT 'Trạm chính';
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "concurrentHours" DOUBLE PRECISION DEFAULT 120;
    `);

    // 2. Mở rộng enum Role
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DIRECTOR';
      ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEPUTY_DIRECTOR';
      ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEPARTMENT_HEAD';
    `);

    // 3. Enum ApprovalStatus
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 4. Cột mở rộng trên Task (Workflow, KPI, Evidence)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskSource" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalStatus" DEFAULT 'APPROVED';
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approverId" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvalNote" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "evidenceFiles" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiQuantity" DOUBLE PRECISION;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiProgress" DOUBLE PRECISION;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiQuality" DOUBLE PRECISION;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiScore" DOUBLE PRECISION;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiComment" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiEvaluatedAt" TIMESTAMP(3);
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorEvidence" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorComment" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorAdjusterId" TEXT;
      ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorAdjustedAt" TIMESTAMP(3);
    `);

    isSchemaEnsured = true;
  } catch (err) {
    console.warn("[ensureDatabaseSchema warning]:", err);
  } finally {
    isEnsuring = false;
  }
}
