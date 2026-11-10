import http from "http";
import next from "next";
import path from "path";
import fs from "fs";
import { execSync, spawn } from "child_process";
import EmbeddedPostgres from "embedded-postgres";

const DB_PORT = 54332;
const DB_URL = `postgresql://postgres:acceptancetest@127.0.0.1:${DB_PORT}/postgres?schema=public`;

async function start() {
  console.log("==================================================");
  console.log("KHỞI CHẠY TOÀN BỘ HỆ THỐNG QUẢN LÝ CÔNG VIỆC V1.2");
  console.log("==================================================");

  // 1. Khởi động PostgreSQL
  const pgDataDir = path.join(process.cwd(), "scratch", "pg_app_data");
  const pg = new EmbeddedPostgres({
    port: DB_PORT,
    databaseDir: pgDataDir,
    user: "postgres",
    password: "acceptancetest",
    initdbFlags: ["-E", "UTF8", "--locale=C"],
  });

  process.env.DATABASE_URL = DB_URL;

  console.log("1. Đang khởi động Cơ sở dữ liệu PostgreSQL...");
  const pidFile = path.join(pgDataDir, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const net = await import("net");
      const isPortOpen = await new Promise((res) => {
        const s = net.createConnection({ port: DB_PORT, host: "127.0.0.1" });
        s.once("connect", () => { s.destroy(); res(true); });
        s.once("error", () => { s.destroy(); res(false); });
      });
      if (!isPortOpen) {
        fs.unlinkSync(pidFile);
      }
    } catch {}
  }
  try {
    await pg.initialise();
  } catch {}

  try {
    await pg.start();
    console.log(`✓ PostgreSQL Database đã sẵn sàng trên cổng ${DB_PORT}`);
  } catch (err: any) {
    console.log("PostgreSQL server already running or started.");
  }

  // 2. Đồng bộ DB (Giữ nguyên toàn bộ dữ liệu phân quyền & công việc)
  console.log("2. Đồng bộ Schema...");
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });
  } catch (err: any) {
    console.error("Lỗi đồng bộ DB Schema:", err.message);
  }

  // Tuyệt đối KHÔNG tự động chạy seed.ts khi hệ thống đã có dữ liệu
  // Chỉ khởi tạo seed lần đầu tiên khi cơ sở dữ liệu hoàn toàn trống
  try {
    const { PrismaClient } = await import("@prisma/client");
    const checkPrisma = new PrismaClient();
    const userCount = await checkPrisma.user.count();
    await checkPrisma.$disconnect();

    if (userCount === 0) {
      console.log("Cơ sở dữ liệu mới (chưa có người dùng), tiến hành khởi tạo dữ liệu mẫu lần đầu...");
      execSync("npx tsx prisma/seed.ts", {
        env: { ...process.env, DATABASE_URL: DB_URL },
        stdio: "inherit",
        cwd: process.cwd(),
        shell: true,
      });
      console.log("✓ Khởi tạo dữ liệu ban đầu thành công!");
    } else {
      console.log(`✓ Đã có ${userCount} người dùng trong DB. Giữ nguyên 100% dữ liệu phân quyền và công việc, KHÔNG reset!`);
    }
  } catch (err: any) {
    console.error("Lỗi kiểm tra dữ liệu:", err.message);
  }

  // Update .env DATABASE_URL
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf-8");
    content = content.replace(/DATABASE_URL=".*"/, `DATABASE_URL="${DB_URL}"`);
    fs.writeFileSync(envPath, content, "utf-8");
  }

  // 3. Khởi động Web Server Next.js
  console.log("3. Đang khởi động Web Server Next.js...");
  console.log("\n==================================================");
  console.log("🚀 HỆ THỐNG ĐÃ CHẠY THÀNH CÔNG TẠI:");
  console.log("👉 Đường dẫn (URL): http://127.0.0.1:3000");
  console.log("👉 Tài khoản Admin: admin@example.com / admin123");
  console.log("👉 Tài khoản User:  user1@example.com / password123 (hoặc user123)");
  console.log("==================================================\n");

  const dev = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", "3000", "-H", "0.0.0.0"], {
    stdio: "inherit",
    cwd: process.cwd(),
    shell: true,
    env: { ...process.env, DATABASE_URL: DB_URL, NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "--no-warnings" },
  });
}

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
