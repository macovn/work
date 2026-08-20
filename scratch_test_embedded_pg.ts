import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

async function testEmbeddedPg() {
  console.log("Initializing embedded-postgres server...");
  const pg = new EmbeddedPostgres({
    port: 54332,
    databaseDir: "./scratch/pg_data",
    user: "postgres",
    password: "postgrespassword",
    dbname: "qlcv",
  });

  try {
    await pg.initialise();
    await pg.start();
    console.log("Embedded PostgreSQL server started successfully on port 54332!");

    const dbUrl = "postgresql://postgres:postgrespassword@localhost:54332/qlcv?schema=public";
    process.env.DATABASE_URL = dbUrl;

    console.log("Running prisma db push...");
    execSync("npx prisma db push --skip-generate", {
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: "utf-8",
    });
    console.log("Prisma schema pushed successfully to embedded PostgreSQL!");

    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });

    await prisma.$connect();
    console.log("PrismaClient connected successfully to Embedded PostgreSQL!");

    const userCount = await prisma.user.count();
    console.log("User count from real PostgreSQL database:", userCount);

    await prisma.$disconnect();
    await pg.stop();
    console.log("PostgreSQL server stopped.");
  } catch (err: any) {
    console.error("Embedded PG Error:", err?.message || err);
    try {
      await pg.stop();
    } catch {}
  }
}

testEmbeddedPg();
