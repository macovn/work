import { NextResponse } from "next/server";
import { prisma, ensureStandardTaskSchema } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createGoogleCalendarEvent } from "@/lib/google-calendar";
import { NotificationEngine } from "@/lib/notification-engine";
import { calculateTaskScores, getConversionFactorByComplexity } from "@/lib/standard-task";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureStandardTaskSchema();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const assigneeId = searchParams.get("assigneeId");
    const field = searchParams.get("field");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const taskType = searchParams.get("taskType");
    const positionId = searchParams.get("positionId");
    const groupId = searchParams.get("groupId");
    const standardTaskId = searchParams.get("standardTaskId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (id) {
      where.id = id;
    }

    if (user.role !== "ADMIN") {
      where.assigneeId = user.id;
    } else if (assigneeId) {
      where.assigneeId = assigneeId;
    }

    if (field) where.field = field;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (taskType) where.taskType = taskType;
    if (positionId) where.positionId = positionId;
    if (groupId) where.groupId = groupId;
    if (standardTaskId) where.standardTaskId = standardTaskId;

    if (startDate || endDate) {
      where.deadline = {};
      if (startDate) where.deadline.gte = new Date(startDate);
      if (endDate) where.deadline.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { field: { contains: search, mode: "insensitive" } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: {
            select: { id: true, fullName: true, email: true },
          },
          kpiEvaluator: {
            select: { id: true, fullName: true, email: true },
          },
          position: {
            select: { id: true, name: true, code: true },
          },
          group: {
            select: { id: true, name: true, code: true, weight: true },
          },
          standardTask: {
            select: {
              id: true,
              name: true,
              code: true,
              unit: true,
              benchmarkScore: true,
              complexityLevel: true,
              conversionFactor: true,
            },
          },
        },
        orderBy: { deadline: "asc" },
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("[Tasks GET API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi lấy danh sách công việc" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureStandardTaskSchema();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền tạo công việc" }, { status: 403 });
    }

    const body = await request.json();
    const {
      code,
      title,
      field,
      assigneeId,
      deadline,
      priority,
      taskType,
      status,
      result,
      notes,
      positionId,
      groupId,
      standardTaskId,
      unit,
      benchmarkScore,
      complexityLevel,
      conversionFactor,
      assignedVolume,
      completedVolume,
    } = body;

    if (!code || !title || !field || !assigneeId || !deadline) {
      return NextResponse.json({ error: "Thiếu các thông tin bắt buộc" }, { status: 400 });
    }

    const existingCode = await prisma.task.findUnique({
      where: { code: code.trim() },
    });
    if (existingCode) {
      return NextResponse.json({ error: `Mã công việc "${code}" đã tồn tại` }, { status: 400 });
    }

    let snapPositionId = positionId || null;
    let snapGroupId = groupId || null;
    let snapStandardTaskId = standardTaskId || null;
    let snapUnit = unit || null;
    let snapBenchmarkScore = typeof benchmarkScore === "number" ? benchmarkScore : null;
    let snapComplexityLevel = complexityLevel || null;
    let snapConversionFactor = typeof conversionFactor === "number" ? conversionFactor : null;

    if (standardTaskId) {
      const stdTask = await prisma.standardTask.findUnique({
        where: { id: standardTaskId },
      });
      if (stdTask) {
        snapPositionId = stdTask.positionId;
        snapGroupId = stdTask.groupId;
        snapStandardTaskId = stdTask.id;
        snapUnit = stdTask.unit;
        snapBenchmarkScore = stdTask.benchmarkScore;
        snapComplexityLevel = stdTask.complexityLevel;
        snapConversionFactor = stdTask.conversionFactor;
      }
    } else if (snapComplexityLevel && !snapConversionFactor) {
      snapConversionFactor = getConversionFactorByComplexity(snapComplexityLevel);
    }

    const parsedAssignedVol = typeof assignedVolume === "number" ? assignedVolume : (assignedVolume ? Number(assignedVolume) : null);
    const parsedCompletedVol = typeof completedVolume === "number" ? completedVolume : (completedVolume ? Number(completedVolume) : null);

    const scores = calculateTaskScores({
      benchmarkScore: snapBenchmarkScore,
      conversionFactor: snapConversionFactor,
      assignedVolume: parsedAssignedVol,
      completedVolume: parsedCompletedVol,
    });

    const settings = await NotificationEngine.getSettings();
    let googleEventId: string | null = null;

    if (settings.googleCalendarEnabled) {
      googleEventId = await createGoogleCalendarEvent({
        id: "",
        code: code.trim(),
        title: title.trim(),
        deadline: new Date(deadline),
        field: field.trim(),
        priority: priority || "LOW",
        taskType: taskType || "RECURRING",
        status: status || "TODO",
        notes: notes || undefined,
      });
    }

    const newTask = await prisma.task.create({
      data: {
        code: code.trim(),
        title: title.trim(),
        field: field.trim(),
        assigneeId,
        deadline: new Date(deadline),
        priority: priority || "LOW",
        taskType: taskType || "RECURRING",
        status: status || "TODO",
        result: result || null,
        notes: notes || null,
        googleEventId,
        positionId: snapPositionId,
        groupId: snapGroupId,
        standardTaskId: snapStandardTaskId,
        unit: snapUnit,
        benchmarkScore: snapBenchmarkScore,
        complexityLevel: snapComplexityLevel,
        conversionFactor: snapConversionFactor,
        assignedVolume: parsedAssignedVol,
        completedVolume: parsedCompletedVol,
        assignedScore: scores.assignedScore,
        completedScore: scores.completedScore,
        completionRate: scores.completionRate,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, email: true },
        },
        position: {
          select: { id: true, name: true, code: true },
        },
        group: {
          select: { id: true, name: true, code: true },
        },
        standardTask: {
          select: { id: true, name: true, code: true, unit: true, benchmarkScore: true, complexityLevel: true, conversionFactor: true },
        },
      },
    });

    NotificationEngine.evaluateAndTriggerNotifications().catch((err) => {
      console.error("[Post Create Notification Error]:", err);
    });

    return NextResponse.json(newTask, { status: 201 });
  } catch (error: any) {
    console.error("[Tasks POST API Error]:", error);
    return NextResponse.json({ error: error?.message || "Lỗi khi tạo công việc" }, { status: 500 });
  }
}
