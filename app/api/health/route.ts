import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        department: true,
      },
    });

    return NextResponse.json({
      status: "ok",
      userCount: users.length,
      users,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
