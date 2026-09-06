-- Audit M1: ngăn trùng thông báo khi nhiều lần chạy NotificationEngine chồng lấn
-- (cron + sau khi tạo/cập nhật task + login alert).

-- 1) Xóa các bản ghi trùng đang tồn tại (giữ bản ghi cũ nhất) trước khi tạo unique index.
DELETE FROM "NotificationLog" a
USING "NotificationLog" b
WHERE a."createdAt" > b."createdAt"
  AND a."userId" = b."userId"
  AND a."taskId" = b."taskId"
  AND a."notificationType" = b."notificationType"
  AND a."channel" = b."channel"
  AND a."ruleKey" = b."ruleKey"
  AND a."deadline" = b."deadline";

-- 2) Bỏ index thường cũ (không unique) nếu còn tồn tại.
DROP INDEX IF EXISTS "NotificationLog_userId_taskId_notificationType_ruleKey_deadline_idx";

-- 3) Unique index khóa theo (user, task, type, CHANNEL, rule, deadline).
CREATE UNIQUE INDEX "NotificationLog_userId_taskId_notificationType_channel_ruleKey_deadline_key"
ON "NotificationLog"("userId", "taskId", "notificationType", "channel", "ruleKey", "deadline");
