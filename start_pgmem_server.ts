import { newDb } from "pg-mem";
import bcrypt from "bcryptjs";

const DB_PORT = 54332;

async function startPgMemServer() {
  console.log("==================================================");
  console.log("KHỜI ĐỘNG PG-MEM POSTGRESQL SERVER (PORT 54332)");
  console.log("==================================================");

  const db = newDb();

  // Create PostgreSQL TCP server on port 54332
  const server = db.adapters.createPgServer({ port: DB_PORT });
  console.log(`✓ PostgreSQL TCP Server (pg-mem) đang lắng nghe tại cổng ${DB_PORT}`);

  // Create Enum & Schema
  await db.public.none(`
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED');
    CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
    CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');
    CREATE TYPE "NotificationType" AS ENUM ('WARNING', 'OVERDUE', 'LOGIN_ALERT');
    CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WEB_PUSH', 'EMAIL', 'ZALO');
    CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

    CREATE TABLE "User" (
      "id" TEXT PRIMARY KEY,
      "email" TEXT UNIQUE NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "fullName" TEXT NOT NULL,
      "role" "Role" DEFAULT 'USER' NOT NULL,
      "status" "UserStatus" DEFAULT 'ACTIVE' NOT NULL,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE "Task" (
      "id" TEXT PRIMARY KEY,
      "code" TEXT UNIQUE NOT NULL,
      "title" TEXT NOT NULL,
      "field" TEXT NOT NULL,
      "assigneeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "deadline" TIMESTAMP NOT NULL,
      "priority" "Priority" DEFAULT 'LOW' NOT NULL,
      "status" "TaskStatus" DEFAULT 'TODO' NOT NULL,
      "result" TEXT,
      "notes" TEXT,
      "googleEventId" TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE "NotificationSetting" (
      "id" TEXT PRIMARY KEY DEFAULT 'default',
      "priorityLowHours" INTEGER DEFAULT 4 NOT NULL,
      "priorityMediumHours" INTEGER DEFAULT 24 NOT NULL,
      "priorityHighHours" INTEGER DEFAULT 48 NOT NULL,
      "enableEmail" BOOLEAN DEFAULT true NOT NULL,
      "enableZalo" BOOLEAN DEFAULT true NOT NULL,
      "enablePush" BOOLEAN DEFAULT true NOT NULL,
      "googleCalendarEnabled" BOOLEAN DEFAULT true NOT NULL,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE "NotificationLog" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
      "notificationType" "NotificationType" NOT NULL,
      "channel" "NotificationChannel" NOT NULL,
      "ruleKey" TEXT NOT NULL,
      "deadline" TIMESTAMP NOT NULL,
      "scheduledAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "sentAt" TIMESTAMP,
      "status" "NotificationStatus" DEFAULT 'SENT' NOT NULL,
      "errorMessage" TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE "InAppNotification" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "isRead" BOOLEAN DEFAULT false NOT NULL,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE "PushSubscription" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "endpoint" TEXT UNIQUE NOT NULL,
      "keys" TEXT NOT NULL,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);

  console.log("✓ Prisma PostgreSQL Schema đã khởi tạo trong pg-mem!");

  // Insert seed data
  const adminPass = await bcrypt.hash("admin123", 10);
  const userPass = await bcrypt.hash("password123", 10);
  const user1Pass = await bcrypt.hash("user123", 10);

  await db.public.none(`
    INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "role", "status") VALUES
    ('user_admin_1', 'admin@example.com', '${adminPass}', 'Quản Trị Viên', 'ADMIN', 'ACTIVE'),
    ('user_user_1', 'user1@example.com', '${user1Pass}', 'Nguyễn Văn A', 'USER', 'ACTIVE'),
    ('user_user_2', 'user2@example.com', '${userPass}', 'Trần Thị B', 'USER', 'ACTIVE'),
    ('user_user_3', 'user3@example.com', '${userPass}', 'Lê Văn C', 'USER', 'ACTIVE');

    INSERT INTO "NotificationSetting" ("id", "priorityLowHours", "priorityMediumHours", "priorityHighHours", "enableEmail", "enableZalo", "enablePush", "googleCalendarEnabled")
    VALUES ('default', 4, 24, 48, true, true, true, true);
  `);

  // Insert demo tasks
  const priorities = ['LOW', 'MEDIUM', 'HIGH'];
  const statuses = ['TODO', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'];
  const fields = ['Hành chính', 'CNTT', 'Kế toán', 'Nhân sự', 'Kinh doanh'];
  const userIds = ['user_user_1', 'user_user_2', 'user_user_3'];

  for (let i = 1; i <= 100; i++) {
    const code = `CV-${String(i).padStart(3, '0')}`;
    const title = `Công việc mẫu #${i} - ${fields[i % fields.length]}`;
    const field = fields[i % fields.length];
    const assigneeId = userIds[i % userIds.length];
    const priority = priorities[i % priorities.length];
    const status = statuses[i % statuses.length];
    const deadline = new Date(Date.now() + (i % 10 - 3) * 86400000).toISOString();

    await db.public.none(`
      INSERT INTO "Task" ("id", "code", "title", "field", "assigneeId", "deadline", "priority", "status", "notes")
      VALUES ('task_${i}', '${code}', '${title}', '${field}', '${assigneeId}', '${deadline}', '${priority}', '${status}', 'Ghi chú cho công việc ${code}');
    `);
  }

  console.log("✓ Nạp thành công Dữ liệu mẫu (1 Admin, 3 Users, 100 Demo Tasks)!");
  console.log("==================================================");
  console.log("🚀 POSTGRESQL DATABASE (PG-MEM) ĐÃ SẴN SÀNG VÀ CHẠY ỔN ĐỊNH!");
  console.log("==================================================");
}

startPgMemServer().catch((err) => {
  console.error("Fatal pg-mem error:", err);
  process.exit(1);
});
