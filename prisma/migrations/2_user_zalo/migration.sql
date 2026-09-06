-- Audit H9: bổ sung Zalo user_id cho User để kênh Zalo có recipient thật
-- (trước đây engine gửi email làm Zalo user_id nên kênh không bao giờ tới nơi).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zaloId" TEXT;
