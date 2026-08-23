import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const binDir = path.join(process.cwd(), "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
const pgCtl = path.join(binDir, "pg_ctl.exe");
const initDb = path.join(binDir, "initdb.exe");
const dataDir = path.join(process.cwd(), "scratch", "pg_app_data");
const logFile = path.join(process.cwd(), "scratch", "postgres.log");

// 1. Initialize if not exists
if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  execSync(`"${initDb}" -D "${dataDir}" -U postgres -E UTF8 --locale=C -A trust`, {
    stdio: "inherit",
  });
}

// 2. Configure port in postgresql.conf
const confPath = path.join(dataDir, "postgresql.conf");
let conf = fs.readFileSync(confPath, "utf-8");
if (!conf.includes("port = 54332")) {
  conf += "\nport = 54332\n";
  fs.writeFileSync(confPath, conf, "utf-8");
}

// 3. Start PostgreSQL with pg_ctl
try {
  execSync(`"${pgCtl}" -D "${dataDir}" -l "${logFile}" start`, {
    stdio: "inherit",
  });
  console.log("✓ PostgreSQL started via pg_ctl on port 54332!");
} catch (e: any) {
  console.log("pg_ctl status:", e.message);
}

// 4. Push schema & Seed
const DB_URL = "postgresql://postgres:acceptancetest@127.0.0.1:54332/postgres?schema=public";
process.env.DATABASE_URL = DB_URL;

try {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "inherit",
    cwd: process.cwd(),
  });
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "inherit",
    cwd: process.cwd(),
  });
  console.log("✓ Database synced & seeded!");
} catch (e: any) {
  console.error("DB push error:", e.message);
}

// 5. Update .env
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, "utf-8");
  content = content.replace(/DATABASE_URL=".*"/, `DATABASE_URL="${DB_URL}"`);
  fs.writeFileSync(envPath, content, "utf-8");
}
