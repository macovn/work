import { newDb } from "pg-mem";
import { PrismaClient } from "@prisma/client";

async function testPgMemDirect() {
  const db = newDb();

  // Create schema in pg-mem
  db.public.none(`
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

  console.log("pg-mem schema initialized!");

  // Test executing SQL directly via pg-mem db
  db.public.none(`
    INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "role", "status")
    VALUES ('u1', 'admin@example.com', 'hash', 'Admin', 'ADMIN', 'ACTIVE');
  `);

  const users = db.public.many(`SELECT * FROM "User"`);
  console.log("pg-mem query result:", users);
}

testPgMemDirect();
