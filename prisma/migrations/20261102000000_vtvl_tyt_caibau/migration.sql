-- AlterTable User: Add VTVL & Biểu D1 (HD 07-BTCTW) fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "positionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "qualification" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workLocation" TEXT DEFAULT 'Trạm chính';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "concurrentHours" DOUBLE PRECISION DEFAULT 120;

-- AlterTable JobPosition: Add VTVL & Biểu C1/C3/D2 (HD 07-BTCTW & NĐ 232/2026/NĐ-CP) fields
ALTER TABLE "JobPosition" ADD COLUMN IF NOT EXISTS "careerRank" TEXT;
ALTER TABLE "JobPosition" ADD COLUMN IF NOT EXISTS "targetRatio" DOUBLE PRECISION;
ALTER TABLE "JobPosition" ADD COLUMN IF NOT EXISTS "approvedQuota" INTEGER;
ALTER TABLE "JobPosition" ADD COLUMN IF NOT EXISTS "currentHeadcount" INTEGER;
ALTER TABLE "JobPosition" ADD COLUMN IF NOT EXISTS "standardHoursYear" INTEGER NOT NULL DEFAULT 1904;
ALTER TABLE "JobPosition" ADD COLUMN IF NOT EXISTS "method" TEXT DEFAULT 'PP1+PP2';

-- AlterTable StandardTask: Add Biểu A1/A2/B1/B2 (HD 07-BTCTW) & QĐ 1399/QĐ-SYT fields
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "missionCodeA1" TEXT;
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "productCode" TEXT;
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "annualVolume" DOUBLE PRECISION;
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "standardMinutes" DOUBLE PRECISION;
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "extraHoursYear" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "digitalSavedHours" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "StandardTask" ADD COLUMN IF NOT EXISTS "evidenceSource" TEXT;

-- AlterTable Task: Add evidenceSource field
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "evidenceSource" TEXT;

-- AddForeignKey User.positionId -> JobPosition.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_positionId_fkey'
    ) THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "JobPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
