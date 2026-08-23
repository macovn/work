import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const DB_PORT = 54332;
const DB_URL = `postgresql://postgres:acceptancetest@127.0.0.1:${DB_PORT}/postgres?schema=public`;

async function main() {
  console.log("==================================================");
  console.log("KHỞI CHẠY HỆ THỐNG QUẢN LÝ CÔNG VIỆC V1.2 (LOCAL)");
  console.log("==================================================");

  const pgDataDir = path.join(process.cwd(), "scratch", "pg_dev_data");

  const pg = new EmbeddedPostgres({
    port: DB_PORT,
    databaseDir: pgDataDir,
    user: "postgres",
    password: "acceptancetest",
    initdbFlags: ["-E", "UTF8", "--locale=C"],
  });

  process.env.DATABASE_URL = DB_URL;

  console.log("1. Đang khởi động Cơ sở dữ liệu PostgreSQL...");
  try {
    await pg.initialise();
  } catch {}

  try {
    await pg.start();
    console.log(`✓ Database PostgreSQL đã khởi động trên cổng ${DB_PORT}`);
  } catch (err: any) {
    console.log("PostgreSQL server already active on port", DB_PORT);
  }

  console.log("2. Đồng bộ Prisma Schema & Nạp dữ liệu mẫu (Seed Data)...");
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });
    execSync("npx tsx prisma/seed.ts", {
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });
    console.log("✓ Dữ liệu mẫu đã sẵn sàng (1 Admin, 3 Users, 100 Demo Tasks, Settings)!");
  } catch (err: any) {
    console.error("Lỗi đồng bộ DB:", err.message);
  }

  // Update .env DATABASE_URL
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf-8");
    content = content.replace(/DATABASE_URL=".*"/, `DATABASE_URL="${DB_URL}"`);
    fs.writeFileSync(envPath, content, "utf-8");
  }

  console.log("\n==================================================");
  console.log("HỆ THỐNG ĐÃ SẴN SÀNG ĐỂ TRUY CẬP:");
  console.log("👉 URL: http://localhost:3000");
  console.log("👉 Tài khoản Admin: admin@example.com / mật khẩu: admin123");
  console.log("👉 Tài khoản User:  user1@example.com / mật khẩu: password123");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
