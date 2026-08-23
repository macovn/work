import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import crypto from "crypto";

const DB_PORT = 54332;
const DB_URL = `postgresql://postgres:acceptancetest@localhost:${DB_PORT}/postgres?schema=public`;

async function execute7LocalIntegrations() {
  console.log("==================================================");
  console.log("EXECUTING 7 LOCAL INTEGRATION ACCEPTANCE TESTS");
  console.log("==================================================");

  // Load .env
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
    }
  }

  // 1. Start Embedded PostgreSQL
  const pgDataDir = path.join(process.cwd(), "scratch", "pg_acceptance_data");
  if (fs.existsSync(pgDataDir)) {
    try {
      fs.rmSync(pgDataDir, { recursive: true, force: true });
    } catch {}
  }

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
    console.log("✓ PostgreSQL Database started on port", DB_PORT);
  } catch (err: any) {
    console.error("✗ Failed to start PostgreSQL:", err.message);
    process.exit(1);
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: DB_URL },
    encoding: "utf-8",
    cwd: process.cwd(),
  });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  await prisma.$connect();

  const results: Record<string, { status: string; evidence: string }> = {};

  // --- KÊNH 1: GOOGLE CALENDAR OAUTH 2.0 (GC-01 .. GC-04) ---
  console.log("\n--- [1] Checking Google Calendar OAuth 2.0 (GC-01 .. GC-04) ---");
  const hasGoogleCreds = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );

  if (!hasGoogleCreds) {
    console.log("  ○ GC-01..04: BLOCKED (Missing Google OAuth 2.0 Credentials in .env)");
    results["GC-01"] = { status: "BLOCKED", evidence: "Chưa cấu hình GOOGLE_CLIENT_ID & GOOGLE_REFRESH_TOKEN trong .env" };
    results["GC-02"] = { status: "BLOCKED", evidence: "Chưa cấu hình GOOGLE_CLIENT_ID & GOOGLE_REFRESH_TOKEN trong .env" };
    results["GC-03"] = { status: "BLOCKED", evidence: "Chưa cấu hình GOOGLE_CLIENT_ID & GOOGLE_REFRESH_TOKEN trong .env" };
    results["GC-04"] = { status: "BLOCKED", evidence: "Chưa cấu hình GOOGLE_CLIENT_ID & GOOGLE_REFRESH_TOKEN trong .env" };
  } else {
    try {
      const { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } = await import("./lib/google-calendar");
      
      // GC-01: Create
      const testTask = await prisma.task.create({
        data: {
          code: "GC-TEST-01",
          title: "Test Google Calendar Event Creation",
          description: "Acceptance Test GC-01",
          field: "Kế hoạch",
          priority: "HIGH",
          status: "TODO",
          deadline: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });

      const createRes = await createGoogleCalendarEvent(testTask);
      if (createRes && createRes.eventId) {
        console.log("  ✓ GC-01: PASS - Event created with Google Event ID:", createRes.eventId);
        results["GC-01"] = { status: "PASS", evidence: `Google Event ID: ${createRes.eventId}, Task: ${testTask.id}` };

        // GC-02: Update deadline
        const newDeadline = new Date(Date.now() + 48 * 3600 * 1000);
        const updatedTask = await prisma.task.update({
          where: { id: testTask.id },
          data: { deadline: newDeadline, googleCalendarEventId: createRes.eventId },
        });
        const updateRes = await updateGoogleCalendarEvent(createRes.eventId, updatedTask);
        if (updateRes && updateRes.eventId) {
          console.log("  ✓ GC-02: PASS - Event deadline updated successfully");
          results["GC-02"] = { status: "PASS", evidence: `Updated Google Event ID: ${updateRes.eventId}, New Deadline: ${newDeadline.toISOString()}` };
        } else {
          console.log("  ✗ GC-02: FAIL - Failed to update Google Calendar Event");
          results["GC-02"] = { status: "FAIL", evidence: "Failed to update Google Calendar Event" };
        }

        // GC-04: Deduplication check
        const dupRes = await createGoogleCalendarEvent(updatedTask);
        if (dupRes && dupRes.eventId === createRes.eventId) {
          console.log("  ✓ GC-04: PASS - Deduplication prevented duplicate event creation");
          results["GC-04"] = { status: "PASS", evidence: "Deduplication confirmed, existing Event ID reused" };
        } else {
          results["GC-04"] = { status: "FAIL", evidence: "Duplicate event was created" };
        }

        // GC-03: Delete
        const deleteRes = await deleteGoogleCalendarEvent(createRes.eventId);
        if (deleteRes) {
          console.log("  ✓ GC-03: PASS - Event deleted successfully from Google Calendar");
          results["GC-03"] = { status: "PASS", evidence: `Deleted Google Event ID: ${createRes.eventId}` };
        } else {
          results["GC-03"] = { status: "FAIL", evidence: "Failed to delete Google Calendar Event" };
        }
      } else {
        console.log("  ✗ GC-01: FAIL - Google Calendar API returned error");
        results["GC-01"] = { status: "FAIL", evidence: "Google Calendar API call failed with credentials provided" };
        results["GC-02"] = { status: "BLOCKED", evidence: "Dependent on GC-01" };
        results["GC-03"] = { status: "BLOCKED", evidence: "Dependent on GC-01" };
        results["GC-04"] = { status: "BLOCKED", evidence: "Dependent on GC-01" };
      }
    } catch (err: any) {
      console.error("  ✗ Google Calendar Exception:", err.message);
      results["GC-01"] = { status: "FAIL", evidence: `Exception: ${err.message}` };
    }
  }

  // --- KÊNH 2: WEB PUSH BROWSER (PUSH-02) ---
  console.log("\n--- [2] Checking Web Push Browser Delivery (PUSH-02) ---");
  const pushSubs = await prisma.pushSubscription.findMany();
  if (pushSubs.length === 0) {
    console.log("  ○ PUSH-02: BLOCKED (Chưa có subscription từ trình duyệt; mở Chrome/Edge đăng nhập và bấm 'Cho phép thông báo')");
    results["PUSH-02"] = { status: "BLOCKED", evidence: "Chờ người dùng mở Chrome/Edge đăng nhập và cấp quyền Push Notification" };
  } else {
    try {
      const { sendWebPushNotification } = await import("./lib/web-push");
      let pushSuccessCount = 0;
      for (const sub of pushSubs) {
        const pushRes = await sendWebPushNotification(sub.subscription, {
          title: "[QLCV] Nhắc việc cận hạn",
          body: "Bạn có công việc cần hoàn thành!",
          url: "/tasks",
        });
        if (pushRes.success) {
          pushSuccessCount++;
        }
      }
      if (pushSuccessCount > 0) {
        console.log(`  ✓ PUSH-02: PASS - Delivered Web Push to ${pushSuccessCount} active browser subscription(s)`);
        results["PUSH-02"] = { status: "PASS", evidence: `Successfully sent Web Push to ${pushSuccessCount} browser client(s)` };
      } else {
        console.log("  ✗ PUSH-02: FAIL - Failed to deliver push to browser subscriptions");
        results["PUSH-02"] = { status: "FAIL", evidence: "Web push delivery rejected by push service" };
      }
    } catch (err: any) {
      results["PUSH-02"] = { status: "FAIL", evidence: `Web Push Exception: ${err.message}` };
    }
  }

  // --- KÊNH 3: EMAIL SMTP (EMAIL-01) ---
  console.log("\n--- [3] Checking Email SMTP Delivery (EMAIL-01) ---");
  const hasSmtpCreds = !!(process.env.SMTP_HOST && process.env.SMTP_PASS && process.env.SMTP_USER);
  if (!hasSmtpCreds) {
    console.log("  ○ EMAIL-01: BLOCKED (Missing SMTP credentials in .env)");
    results["EMAIL-01"] = { status: "BLOCKED", evidence: "Chưa cấu hình SMTP_HOST, SMTP_USER, SMTP_PASS trong .env" };
  } else {
    try {
      const { sendEmail } = await import("./lib/email");
      const emailRes = await sendEmail({
        to: process.env.SMTP_USER,
        subject: "[QLCV] Kiểm tra kết nối Email SMTP V1.2",
        html: "<p>Email kiểm thử nghiệm thu hệ thống Quản lý công việc V1.2</p>",
      });
      if (emailRes.success) {
        console.log("  ✓ EMAIL-01: PASS - Email sent successfully via SMTP to:", process.env.SMTP_USER);
        results["EMAIL-01"] = { status: "PASS", evidence: `Email delivered to ${process.env.SMTP_USER} via SMTP Host ${process.env.SMTP_HOST}` };
      } else {
        console.log("  ✗ EMAIL-01: FAIL - SMTP error:", emailRes.error);
        results["EMAIL-01"] = { status: "FAIL", evidence: `SMTP Error: ${emailRes.error}` };
      }
    } catch (err: any) {
      results["EMAIL-01"] = { status: "FAIL", evidence: `SMTP Exception: ${err.message}` };
    }
  }

  // --- KÊNH 4: ZALO OA (ZALO-01) ---
  console.log("\n--- [4] Checking Zalo OA Message Delivery (ZALO-01) ---");
  const hasZaloCreds = !!(process.env.ZALO_OA_APP_ID && process.env.ZALO_OA_ACCESS_TOKEN);
  if (!hasZaloCreds) {
    console.log("  ○ ZALO-01: BLOCKED (Missing Zalo OA credentials in .env)");
    results["ZALO-01"] = { status: "BLOCKED", evidence: "Chưa cấu hình ZALO_OA_APP_ID & ZALO_OA_ACCESS_TOKEN trong .env" };
  } else {
    try {
      const { sendZaloNotification } = await import("./lib/zalo");
      const zaloRes = await sendZaloNotification({
        phoneOrUserZaloId: "TEST_USER_ID",
        message: "[QLCV] Kiểm thử thông báo Zalo OA V1.2",
      });
      if (zaloRes.success) {
        console.log("  ✓ ZALO-01: PASS - Zalo OA message sent successfully");
        results["ZALO-01"] = { status: "PASS", evidence: "Zalo OA message delivered successfully via Open API" };
      } else {
        console.log("  ✗ ZALO-01: FAIL - Zalo error:", zaloRes.error);
        results["ZALO-01"] = { status: "FAIL", evidence: `Zalo API Error: ${zaloRes.error}` };
      }
    } catch (err: any) {
      results["ZALO-01"] = { status: "FAIL", evidence: `Zalo Exception: ${err.message}` };
    }
  }

  // --- KÊNH 5: CRON-01 (LOCKED TO BLOCKED) ---
  console.log("\n--- [5] Vercel Production Cron (CRON-01) ---");
  console.log("  ○ CRON-01: BLOCKED — VERCEL PRODUCTION NOT DEPLOYED (Giữ nguyên theo Hợp đồng)");
  results["CRON-01"] = { status: "BLOCKED", evidence: "Chờ triển khai Vercel Production" };

  // --- UPDATE MASTER ACCEPTANCE RESULTS ---
  const masterResultsPath = path.join(process.cwd(), "acceptance-results.json");
  const masterResults = JSON.parse(fs.readFileSync(masterResultsPath, "utf-8"));

  for (const r of masterResults) {
    if (results[r.id]) {
      r.status = results[r.id].status;
      r.evidence = results[r.id].evidence;
      r.executedAt = new Date().toISOString();
    }
  }

  fs.writeFileSync(masterResultsPath, JSON.stringify(masterResults, null, 2), "utf-8");

  // Re-calculate counts
  const total = masterResults.length;
  const p = masterResults.filter((r: any) => r.status === "PASS").length;
  const f = masterResults.filter((r: any) => r.status === "FAIL").length;
  const b = masterResults.filter((r: any) => r.status === "BLOCKED").length;
  const nt = masterResults.filter((r: any) => r.status === "NOT_TESTED").length;

  console.log("\n==================================================");
  console.log(`TOTAL ACCEPTANCE TESTS: ${total}`);
  console.log(`PASS: ${p}`);
  console.log(`FAIL: ${f}`);
  console.log(`BLOCKED: ${b}`);
  console.log(`NOT_TESTED: ${nt}`);
  console.log("==================================================");

  // Update SHA256
  const evidenceLogPath = path.join(process.cwd(), "acceptance-evidence", "raw-test-evidence.log");
  const buildLogPath = path.join(process.cwd(), "acceptance-evidence", "build-output.log");

  const resultsHash = crypto.createHash("sha256").update(fs.readFileSync(masterResultsPath)).digest("hex");
  const evidenceHash = crypto.createHash("sha256").update(fs.readFileSync(evidenceLogPath)).digest("hex");
  const buildHash = crypto.createHash("sha256").update(fs.readFileSync(buildLogPath)).digest("hex");

  const checksumContent = `${resultsHash}  acceptance-results.json\n${evidenceHash}  acceptance-evidence/raw-test-evidence.log\n${buildHash}  acceptance-evidence/build-output.log\n`;
  fs.writeFileSync(path.join(process.cwd(), "acceptance-evidence.sha256"), checksumContent, "utf-8");

  await prisma.$disconnect();
  try {
    await pg.stop();
  } catch {}
}

execute7LocalIntegrations().catch((err) => {
  console.error("Execution Error:", err);
  process.exit(1);
});
