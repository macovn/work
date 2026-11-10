import { prisma } from "./prisma";

let isSchemaEnsured = false;
let isEnsuring = false;

const DDL_STATEMENTS = [
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffCode" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "positionId" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "qualification" TEXT',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workLocation" TEXT DEFAULT \'Trạm chính\'',
  'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "concurrentHours" DOUBLE PRECISION DEFAULT 120',
  'ALTER TYPE "Role" ADD VALUE IF NOT EXISTS \'DIRECTOR\'',
  'ALTER TYPE "Role" ADD VALUE IF NOT EXISTS \'DEPUTY_DIRECTOR\'',
  'ALTER TYPE "Role" ADD VALUE IF NOT EXISTS \'DEPARTMENT_HEAD\'',
  `DO $$ BEGIN CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskSource" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalStatus" DEFAULT \'APPROVED\'',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approverId" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3)',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvalNote" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdById" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "evidenceFiles" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiQuantity" DOUBLE PRECISION',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiProgress" DOUBLE PRECISION',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiQuality" DOUBLE PRECISION',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiScore" DOUBLE PRECISION',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiComment" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfKpiEvaluatedAt" TIMESTAMP(3)',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorEvidence" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorComment" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorAdjusterId" TEXT',
  'ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "directorAdjustedAt" TIMESTAMP(3)',
];

/**
 * Tự động đảm bảo schema cơ sở dữ liệu trên Neon/PostgreSQL luôn có đầy đủ
 * các cột và enum mới nhất, bảo vệ hệ thống khỏi lỗi P2022 (missing column)
 * khi chạy trên môi trường serverless/Vercel.
 */
export async function ensureDatabaseSchema(): Promise<{ success: boolean; errors: string[] }> {
  if (isSchemaEnsured) return { success: true, errors: [] };
  if (isEnsuring) return { success: false, errors: ["Already in progress"] };
  isEnsuring = true;

  const errors: string[] = [];

  for (const stmt of DDL_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: any) {
      errors.push(`[${stmt.slice(0, 40)}...]: ${err?.message || String(err)}`);
    }
  }

  isEnsuring = false;
  if (errors.length === 0) {
    isSchemaEnsured = true;
  }

  return { success: errors.length === 0, errors };
}
