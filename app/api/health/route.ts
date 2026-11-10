import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDatabaseSchema } from "@/lib/db-schema-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const userCount = await prisma.user.count();
    const durationMs = Date.now() - start;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      userCount,
      latencyMs: durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const durationMs = Date.now() - start;
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        error: error?.message || String(error),
        latencyMs: durationMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
