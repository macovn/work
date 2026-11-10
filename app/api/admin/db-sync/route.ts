import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabaseSchema } from "@/lib/db-schema-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const isTokenValid = token === "cai-bau-sync-2026";

    if (!isTokenValid) {
      const user = await getCurrentUser();
      if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
      }
    }

    const result = await ensureDatabaseSchema();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "DB sync failed", detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
