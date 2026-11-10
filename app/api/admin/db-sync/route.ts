import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureDatabaseSchema } from "@/lib/db-schema-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
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
