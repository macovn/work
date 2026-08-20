import fs from "fs";
import path from "path";
import crypto from "crypto";

async function verifyGoLiveIntegrations() {
  console.log("==================================================");
  console.log("GO-LIVE PRODUCTION INTEGRATION CHECK V1.2");
  console.log("==================================================");

  // 1. Google OAuth 2.0
  const gc01_04_ready = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
  console.log("Google OAuth 2.0 Credentials Present:", gc01_04_ready);

  // 2. Web Push
  const isVapidReal =
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.includes("...") &&
    process.env.VAPID_PRIVATE_KEY !== "your-vapid-private-key";
  const isBrowserActive = typeof window !== "undefined";
  console.log("VAPID Real Keys Present:", isVapidReal);
  console.log("Active Browser Runtime:", isBrowserActive);

  // 3. Email SMTP
  const smtpReady = !!(process.env.SMTP_HOST && process.env.SMTP_PASS);
  console.log("SMTP Credentials Present:", smtpReady);

  // 4. Zalo OA
  const zaloReady = !!(process.env.ZALO_OA_APP_ID && process.env.ZALO_OA_ACCESS_TOKEN);
  console.log("Zalo OA Credentials Present:", zaloReady);

  // 5. Vercel Production
  const vercelReady = !!(process.env.VERCEL && process.env.VERCEL_ENV === "production");
  console.log("Vercel Production Active:", vercelReady);

  // Read acceptance-results.json
  const resultsPath = path.join(process.cwd(), "acceptance-results.json");
  const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

  const total = results.length;
  const p = results.filter((r: any) => r.status === "PASS").length;
  const f = results.filter((r: any) => r.status === "FAIL").length;
  const b = results.filter((r: any) => r.status === "BLOCKED").length;
  const nt = results.filter((r: any) => r.status === "NOT_TESTED").length;

  console.log("\n==================================================");
  console.log(`TOTAL TEST CASES: ${total}`);
  console.log(`PASS: ${p}`);
  console.log(`FAIL: ${f}`);
  console.log(`BLOCKED: ${b}`);
  console.log(`NOT_TESTED: ${nt}`);
  console.log("==================================================");
}

verifyGoLiveIntegrations();
