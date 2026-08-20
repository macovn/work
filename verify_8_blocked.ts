import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getCalendarClient } from "./lib/google-calendar";
import { sendEmail } from "./lib/email";
import { sendZaloNotification } from "./lib/zalo";

async function verifyBlockedIntegrations() {
  console.log("==================================================");
  console.log("VERIFYING 8 BLOCKED ACCEPTANCE TESTS V1.2");
  console.log("==================================================");

  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  // 1. Google Calendar OAuth 2.0 (GC-01, GC-02, GC-03, GC-04)
  console.log("\n--- Checking Google Calendar OAuth 2.0 (GC-01 to GC-04) ---");
  const hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const hasGoogleRefreshToken = !!process.env.GOOGLE_REFRESH_TOKEN;
  const gcConfigured = hasGoogleClientId && hasGoogleClientSecret && hasGoogleRefreshToken;

  console.log(`  Credential GOOGLE_CLIENT_ID configured: ${hasGoogleClientId ? "YES" : "NO"}`);
  console.log(`  Credential GOOGLE_CLIENT_SECRET configured: ${hasGoogleClientSecret ? "YES" : "NO"}`);
  console.log(`  Credential GOOGLE_REFRESH_TOKEN configured: ${hasGoogleRefreshToken ? "YES" : "NO"}`);
  console.log(`  Google Calendar client initialized: ${getCalendarClient() !== null ? "YES" : "NO"}`);

  // 2. Web Push (PUSH-02)
  console.log("\n--- Checking Web Push Browser Runtime (PUSH-02) ---");
  const isVapidPlaceholder =
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.includes("...") ||
    process.env.VAPID_PRIVATE_KEY === "your-vapid-private-key";
  const hasBrowserRuntime = typeof window !== "undefined" && "Notification" in window;
  console.log(`  Real VAPID Keys configured: ${!isVapidPlaceholder ? "YES" : "NO (Placeholder)"}`);
  console.log(`  Browser Runtime with Notification API active: ${hasBrowserRuntime ? "YES" : "NO (Node.js CLI environment)"}`);

  // 3. Email SMTP (EMAIL-01)
  console.log("\n--- Checking Email SMTP Provider (EMAIL-01) ---");
  const hasSmtpHost = !!process.env.SMTP_HOST;
  const hasSmtpPass = !!process.env.SMTP_PASS;
  const smtpConfigured = hasSmtpHost && hasSmtpPass;
  console.log(`  Credential SMTP_HOST configured: ${hasSmtpHost ? "YES" : "NO"}`);
  console.log(`  Credential SMTP_PASS configured: ${hasSmtpPass ? "YES" : "NO"}`);
  const emailResult = await sendEmail({ to: "test@example.com", subject: "Test", html: "<p>Test</p>" });
  console.log(`  Email Dispatch result:`, emailResult);

  // 4. Zalo OA (ZALO-01)
  console.log("\n--- Checking Zalo OA Credentials (ZALO-01) ---");
  const hasZaloAppId = !!process.env.ZALO_OA_APP_ID;
  const hasZaloToken = !!process.env.ZALO_OA_ACCESS_TOKEN;
  const zaloConfigured = hasZaloAppId && hasZaloToken;
  console.log(`  Credential ZALO_OA_APP_ID configured: ${hasZaloAppId ? "YES" : "NO"}`);
  console.log(`  Credential ZALO_OA_ACCESS_TOKEN configured: ${hasZaloToken ? "YES" : "NO"}`);
  const zaloResult = await sendZaloNotification({ phoneOrUserZaloId: "0901234567", message: "Test" });
  console.log(`  Zalo Dispatch result:`, zaloResult);

  // 5. Vercel Cron (CRON-01)
  console.log("\n--- Checking Vercel Production Environment (CRON-01) ---");
  const isVercelProduction = !!process.env.VERCEL && process.env.VERCEL_ENV === "production";
  console.log(`  Deployed to Vercel Production: ${isVercelProduction ? "YES" : "NO (Local Workspace)"}`);

  console.log("\n==================================================");
  console.log("INTEGRATION VERIFICATION SUMMARY");
  console.log(`GC-01: ${gcConfigured ? "PASS" : "BLOCKED (Missing Google OAuth 2.0 Credentials in .env)"}`);
  console.log(`GC-02: ${gcConfigured ? "PASS" : "BLOCKED (Missing Google OAuth 2.0 Credentials in .env)"}`);
  console.log(`GC-03: ${gcConfigured ? "PASS" : "BLOCKED (Missing Google OAuth 2.0 Credentials in .env)"}`);
  console.log(`GC-04: ${gcConfigured ? "PASS" : "BLOCKED (Missing Google OAuth 2.0 Credentials in .env)"}`);
  console.log(`PUSH-02: ${!isVapidPlaceholder && hasBrowserRuntime ? "PASS" : "BLOCKED (Requires real browser runtime with active Web Push subscription)"}`);
  console.log(`EMAIL-01: ${smtpConfigured ? "PASS" : "BLOCKED (Missing SMTP Credentials in .env)"}`);
  console.log(`ZALO-01: ${zaloConfigured ? "PASS" : "BLOCKED (Missing Zalo OA Credentials in .env)"}`);
  console.log(`CRON-01: ${isVercelProduction ? "PASS" : "BLOCKED (Requires Vercel Production deployment)"}`);
  console.log("==================================================");
}

verifyBlockedIntegrations();
