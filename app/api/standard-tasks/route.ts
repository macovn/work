import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ComplexityLevel } from "@prisma/client";
import { getConversionFactorByComplexity } from "@/lib/standard-task";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get("positionId");
    const groupId = searchParams.get("groupId");
    const search = searchParams.get("search");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: any = {};
    if (!includeInactive) where.isActive = true;
    if (positionId) where.positionId = positionId;
    if (groupId) where.groupId = groupId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { missionCodeA1: { contains: search, mode: "insensitive" } },
      ];
    }

    const standardTasks = await prisma.standardTask.findMany({
      where,
      include: {
        position: { select: { id: true, name: true, code: true, careerRank: true } },
        group: { select: { id: true, name: true, code: true, weight: true } },
      },
      orderBy: [
        { position: { order: "asc" } },
        { group: { order: "asc" } },
        { order: "asc" },
        { code: "asc" },
      ],
    });

    return NextResponse.json(standardTasks);
  } catch (error: any) {
    console.error("[StandardTasks GET Error]:", error);
    return NextResponse.json({ error: "Lỗi tải Danh mục công việc chuẩn" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền tạo Công việc chuẩn" }, { status: 403 });
    }

    const body = await request.json();
    const {
      positionId,
      groupId,
      code,
      name,
      unit,
      benchmarkScore,
      complexityLevel,
      conversionFactor,
      missionCodeA1,
      productCode,
      annualVolume,
      standardMinutes,
      extraHoursYear,
      digitalSavedHours,
      evidenceSource,
      isActive,
      order,
    } = body;

    if (!positionId || !groupId || !code || !name || !unit || benchmarkScore === undefined || !complexityLevel) {
      return NextResponse.json(
        { error: "Vui lòng nhập đầy đủ: Vị trí, Nhóm, Mã, Tên công việc, ĐVT, Điểm chuẩn và Mức độ N1-N5" },
        { status: 400 }
      );
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanLevel = String(complexityLevel).toUpperCase() as ComplexityLevel;
    const autoFactor = getConversionFactorByComplexity(cleanLevel);
    const finalFactor = typeof conversionFactor === "number" && !isNaN(conversionFactor) ? conversionFactor : autoFactor;

    const existing = await prisma.standardTask.findUnique({
      where: { code: cleanCode },
    });

    if (existing) {
      return NextResponse.json({ error: `Mã công việc chuẩn '${cleanCode}' đã tồn tại` }, { status: 400 });
    }

    const standardTask = await prisma.standardTask.create({
      data: {
        positionId,
        groupId,
        code: cleanCode,
        name: String(name).trim(),
        unit: String(unit).trim(),
        benchmarkScore: Number(benchmarkScore),
        complexityLevel: cleanLevel,
        conversionFactor: finalFactor,
        missionCodeA1: missionCodeA1 ? String(missionCodeA1).trim() : null,
        productCode: productCode ? String(productCode).trim() : null,
        annualVolume: annualVolume !== undefined && annualVolume !== null ? Number(annualVolume) : null,
        standardMinutes: standardMinutes !== undefined && standardMinutes !== null ? Number(standardMinutes) : null,
        extraHoursYear: extraHoursYear !== undefined && extraHoursYear !== null ? Number(extraHoursYear) : 0,
        digitalSavedHours: digitalSavedHours !== undefined && digitalSavedHours !== null ? Number(digitalSavedHours) : 0,
        evidenceSource: evidenceSource ? String(evidenceSource).trim() : null,
        isActive: isActive !== false,
        order: typeof order === "number" ? order : 0,
      },
      include: {
        position: true,
        group: true,
      },
    });

    return NextResponse.json(standardTask, { status: 201 });
  } catch (error: any) {
    console.error("[StandardTasks POST Error]:", error);
    return NextResponse.json({ error: "Lỗi tạo Công việc chuẩn" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền cập nhật Công việc chuẩn" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      name,
      unit,
      benchmarkScore,
      complexityLevel,
      conversionFactor,
      missionCodeA1,
      productCode,
      annualVolume,
      standardMinutes,
      extraHoursYear,
      digitalSavedHours,
      evidenceSource,
      isActive,
      order,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID công việc chuẩn là bắt buộc" }, { status: 400 });
    }

    const updateData: any = {};
    if (name) updateData.name = String(name).trim();
    if (unit) updateData.unit = String(unit).trim();
    if (benchmarkScore !== undefined) updateData.benchmarkScore = Number(benchmarkScore);
    if (complexityLevel) {
      updateData.complexityLevel = String(complexityLevel).toUpperCase() as ComplexityLevel;
      updateData.conversionFactor =
        typeof conversionFactor === "number"
          ? conversionFactor
          : getConversionFactorByComplexity(updateData.complexityLevel);
    } else if (conversionFactor !== undefined) {
      updateData.conversionFactor = Number(conversionFactor);
    }
    if (missionCodeA1 !== undefined) updateData.missionCodeA1 = missionCodeA1 ? String(missionCodeA1).trim() : null;
    if (productCode !== undefined) updateData.productCode = productCode ? String(productCode).trim() : null;
    if (annualVolume !== undefined) updateData.annualVolume = annualVolume !== null ? Number(annualVolume) : null;
    if (standardMinutes !== undefined) updateData.standardMinutes = standardMinutes !== null ? Number(standardMinutes) : null;
    if (extraHoursYear !== undefined) updateData.extraHoursYear = extraHoursYear !== null ? Number(extraHoursYear) : 0;
    if (digitalSavedHours !== undefined) updateData.digitalSavedHours = digitalSavedHours !== null ? Number(digitalSavedHours) : 0;
    if (evidenceSource !== undefined) updateData.evidenceSource = evidenceSource ? String(evidenceSource).trim() : null;
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (typeof order === "number") updateData.order = order;

    const updated = await prisma.standardTask.update({
      where: { id },
      data: updateData,
      include: {
        position: true,
        group: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[StandardTasks PUT Error]:", error);
    return NextResponse.json({ error: "Lỗi cập nhật Công việc chuẩn" }, { status: 500 });
  }
}
