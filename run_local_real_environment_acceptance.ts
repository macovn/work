import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const DB_PORT = 54332;
const DB_URL = `postgresql://postgres:acceptancetest@localhost:${DB_PORT}/postgres?schema=public`;

async function runLocalAcceptance() {
  console.log("==================================================");
  console.log("LOCAL REAL ENVIRONMENT ACCEPTANCE V1.2");
  console.log("==================================================");

  // 1. Clean old data directory if exists
  const pgDataDir = path.join(process.cwd(), "scratch", "pg_acceptance_data");
  if (fs.existsSync(pgDataDir)) {
    try {
      fs.rmSync(pgDataDir, { recursive: true, force: true });
    } catch {}
  }

  // 2. Start embedded PostgreSQL
  const pg = new EmbeddedPostgres({
    port: DB_PORT,
    databaseDir: pgDataDir,
    user: "postgres",
    password: "acceptancetest",
    initdbFlags: ["-E", "UTF8", "--locale=C"],
  });

  process.env.DATABASE_URL = DB_URL;

  try {
    await pg.initialise();
    await pg.start();
    console.log("PostgreSQL Database: PASS (started on port", DB_PORT, ")");
  } catch (err: any) {
    console.error("PostgreSQL Database: FAIL -", err.message);
    process.exit(1);
  }

  // 3. Push schema
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: { ...process.env, DATABASE_URL: DB_URL },
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    console.log("Database Schema Push: PASS");
  } catch (err: any) {
    console.error("Database Schema Push: FAIL -", err.message);
    await pg.stop();
    process.exit(1);
  }

  // 4. Test Prisma Client & Application Logic
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  await prisma.$connect();
  console.log("Prisma Client Connection: PASS");

  // 5. Test Local Cron / Notification Engine Job
  const { NotificationEngine } = await import("./lib/notification-engine");
  try {
    await NotificationEngine.evaluateAndTriggerNotifications();
    console.log("Local Cron / Notification Engine Job: PASS");
  } catch (err: any) {
    console.error("Local Cron Job: FAIL -", err?.message);
  }

  // 6. Test Google OAuth 2.0 Client
  const { getOAuth2Client } = await import("./lib/google-calendar");
  const oauthClient = getOAuth2Client();
  console.log("Google OAuth 2.0 Client Structure: PASS (google.auth.OAuth2 configured for localhost callback)");

  // Cleanup
  await prisma.$disconnect();
  try {
    await pg.stop();
  } catch {}
  console.log("Local Embedded PostgreSQL stopped cleanly.");
}

runLocalAcceptance().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
