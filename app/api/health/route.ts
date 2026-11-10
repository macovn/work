import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rawColumns: any[] = await prisma.$queryRawUnsafe(`
      SELECT table_schema, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User'
      ORDER BY ordinal_position;
    `);

    // Thử chạy trực tiếp ALTER TABLE
    let alterResult = "not attempted";
    try {
      const res = await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT;`);
      alterResult = `Executed, rows affected: ${res}`;
    } catch (e: any) {
      alterResult = `Error: ${e?.message}`;
    }

    const currentSchema: any[] = await prisma.$queryRawUnsafe(`
      SELECT current_schema(), current_database(), current_user;
    `);

    return NextResponse.json({
      status: "ok",
      currentSchema,
      alterResult,
      columns: rawColumns.map((c) => `${c.table_schema}.${c.column_name} (${c.data_type})`),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        error: error?.message || String(error),
        code: error?.code,
      },
      { status: 500 }
    );
  }
}
