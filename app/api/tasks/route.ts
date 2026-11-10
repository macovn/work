import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createGoogleCalendarEvent } from "@/lib/google-calendar";
import { NotificationEngine } from "@/lib/notification-engine";
import { calculateTaskScores, getConversionFactorByComplexity } from "@/lib/standard-task";
import { fromLocalInputValue } from "@/lib/utils";
import { isExecutive, isManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function extractRankNumber(...sources: (string | null | undefined)[]): number | null {
  for (const src of sources) {
    if (!src) continue;
    const mCode = src.match(/\.B([1-5])\b/i) || src.match(/\bB([1-5])\b/);
    if (mCode) return Number(mCode[1]);
    const mText = src.match(/Bậc\s*([1-5])/i);
    if (mText) return Number(mText[1]);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const assigneeId = searchParams.get("assigneeId");
    const department = searchParams.get("department");
    const field = searchParams.get("field");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const taskType = searchParams.get("taskType");
    const positionId = searchParams.get("positionId");
    const groupId = searchParams.get("groupId");
    const standardTaskId = searchParams.get("standardTaskId");
    const approvalStatus = searchParams.get("approvalStatus");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 100);
    const skip = (page - 1) * limit;

    const andFilters: any[] = [];

    if (id) {
      andFilters.push({ id });
    }

    if (isExecutive(user.role)) {
      if (assigneeId) andFilters.push({ assigneeId });
      if (department) {
        andFilters.push({
          OR: [{ department }, { assignee: { department } }],
        });
      }
    } else if (user.role === "DEPARTMENT_HEAD") {
      // Phụ trách bộ phận: CHỈ xem công việc & KPI thuộc bộ phận mình phụ trách (hoặc việc do mình làm)
      const myDept = user.department;
      if (myDept) {
        andFilters.push({
          OR: [
            { department: myDept },
            { assignee: { department: myDept } },
            { assigneeId: user.id },
          ],
        });
      } else {
        andFilters.push({ assigneeId: user.id });
      }

      if (assigneeId) {
        andFilters.push({ assigneeId });
      }
    } else {
      // Viên chức: chỉ xem công việc của chính mình
      andFilters.push({ assigneeId: user.id });
    }

    if (field) andFilters.push({ field });
    if (status) andFilters.push({ status });
    if (priority) andFilters.push({ priority });
    if (taskType) andFilters.push({ taskType });
    if (positionId) andFilters.push({ positionId });
    if (groupId) andFilters.push({ groupId });
    if (standardTaskId) andFilters.push({ standardTaskId });
    if (approvalStatus) andFilters.push({ approvalStatus });

    if (startDate || endDate) {
      const deadlineCond: any = {};
      if (startDate) {
        const s = fromLocalInputValue(startDate);
        if (s) deadlineCond.gte = s;
      }
      if (endDate) {
        const e = fromLocalInputValue(endDate);
        if (e) deadlineCond.lte = e;
      }
      andFilters.push({ deadline: deadlineCond });
    }

    if (search) {
      andFilters.push({
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
          { field: { contains: search, mode: "insensitive" } },
          { assignee: { fullName: { contains: search, mode: "insensitive" } } },
          { assignee: { staffCode: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    const where = andFilters.length > 0 ? { AND: andFilters } : {};

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: {
            select: { id: true, fullName: true, email: true, department: true, positionId: true, workLocation: true, staffCode: true },
          },
          approver: {
            select: { id: true, fullName: true, email: true },
          },
          creator: {
            select: { id: true, fullName: true, email: true },
          },
          kpiEvaluator: {
            select: { id: true, fullName: true, email: true },
          },
          directorAdjuster: {
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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userIsManager = isManager(user.role);

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
      evidenceSource,
      evidenceFiles,
      taskSource,
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

    // Xác định người thực hiện & quyền hạn:
    // - Viên chức thường: tự tạo việc đột xuất cho chính mình, trạng thái bắt buộc PENDING chờ duyệt
    // - Quản lý: giao việc cho nhân sự (hoặc chính mình), mặc định APPROVED
    let finalAssigneeId = assigneeId;
    let finalTaskType = taskType || "RECURRING";
    let finalApprovalStatus: "PENDING" | "APPROVED" = "APPROVED";
    let finalApproverId: string | null = user.id;
    let finalApprovedAt: Date | null = new Date();
    let finalStatus = status || "TODO";
    let finalTaskSource = taskSource ? String(taskSource).trim() : null;

    if (!userIsManager) {
      // Viên chức tự tạo nhiệm vụ đột xuất (từ Chính quyền điện tử, cấp trên giao trực tiếp...)
      finalAssigneeId = user.id;
      finalTaskType = "AD_HOC";
      finalApprovalStatus = "PENDING";
      finalApproverId = null;
      finalApprovedAt = null;
      finalStatus = "TODO"; // Không được phép bắt đầu triển khai khi chưa duyệt
      if (!finalTaskSource) {
        finalTaskSource = "Chính quyền điện tử / Cấp trên giao trực tiếp";
      }
    } else {
      // Phụ trách bộ phận chỉ được giao việc cho nhân sự cùng bộ phận hoặc chính mình
      if (user.role === "DEPARTMENT_HEAD" && finalAssigneeId && finalAssigneeId !== user.id) {
        const targetUser = await prisma.user.findUnique({
          where: { id: finalAssigneeId },
          select: { department: true },
        });
        const sameDept =
          user.department &&
          targetUser?.department &&
          user.department.trim().toLowerCase() === targetUser.department.trim().toLowerCase();
        if (!sameDept) {
          return NextResponse.json(
            {
              error: `Phụ trách bộ phận (${user.department}) chỉ được giao việc cho nhân sự thuộc bộ phận mình`,
            },
            { status: 403 }
          );
        }
      }
    }

    if (!title || !field || !finalAssigneeId || !deadline) {
      return NextResponse.json({ error: "Thiếu các thông tin bắt buộc (Tiêu đề, Lĩnh vực, Deadline)" }, { status: 400 });
    }

    // Tự động sinh mã công việc nếu không nhập
    const finalCode = code?.trim() || (finalTaskType === "AD_HOC" ? `DX-${Date.now().toString().slice(-6)}` : `CV-${Date.now().toString().slice(-6)}`);

    // Deadline naive được hiểu theo giờ Việt Nam (audit H7) — không phụ thuộc TZ server.
    const parsedDeadline = fromLocalInputValue(deadline);
    if (!parsedDeadline) {
      return NextResponse.json({ error: "Deadline không hợp lệ" }, { status: 400 });
    }

    const existingCode = await prisma.task.findUnique({
      where: { code: finalCode },
    });
    if (existingCode) {
      return NextResponse.json({ error: `Mã công việc "${finalCode}" đã tồn tại` }, { status: 400 });
    }

    let snapPositionId = positionId || null;
    let snapGroupId = groupId || null;
    let snapStandardTaskId = standardTaskId || null;
    let snapUnit = unit || null;
    let snapBenchmarkScore = typeof benchmarkScore === "number" ? benchmarkScore : null;
    let snapComplexityLevel = complexityLevel || null;
    let snapConversionFactor = typeof conversionFactor === "number" ? conversionFactor : null;
    let snapEvidenceSource = evidenceSource ? String(evidenceSource).trim() : null;

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
        if (!snapEvidenceSource && stdTask.evidenceSource) {
          snapEvidenceSource = stdTask.evidenceSource;
        }
      }
    } else if (snapComplexityLevel && !snapConversionFactor) {
      snapConversionFactor = getConversionFactorByComplexity(snapComplexityLevel);
    }

    // Kiểm tra Bậc VTVL của Người thực hiện phải >= Bậc của Vị trí việc làm / Lĩnh vực giao
    const [targetPos, assigneeUser] = await Promise.all([
      snapPositionId ? prisma.jobPosition.findUnique({ where: { id: snapPositionId } }) : Promise.resolve(null),
      prisma.user.findUnique({
        where: { id: finalAssigneeId },
        include: { position: true },
      }),
    ]);

    const requiredRank = extractRankNumber(targetPos?.code, targetPos?.name, targetPos?.careerRank, field);
    if (requiredRank !== null) {
      const userRank = extractRankNumber(
        assigneeUser?.position?.code,
        assigneeUser?.position?.name,
        assigneeUser?.position?.careerRank
      );
      if (userRank === null || userRank < requiredRank) {
        return NextResponse.json(
          {
            error: `Lĩnh vực/VTVL yêu cầu từ Bậc ${requiredRank} (B${requiredRank}–B5) trở lên. Viên chức "${
              assigneeUser?.fullName || ""
            }" hiện đang ở ${assigneeUser?.position?.code || "chưa đủ bậc"} (Bậc ${userRank ?? "chưa xếp"}).`,
          },
          { status: 400 }
        );
      }
    }

    const parsedAssignedVol = typeof assignedVolume === "number" ? assignedVolume : (assignedVolume ? Number(assignedVolume) : null);
    const parsedCompletedVol = typeof completedVolume === "number" ? completedVolume : (completedVolume ? Number(completedVolume) : null);

    // Audit M3: từ chối số âm/NaN cho khối lượng.
    if (parsedAssignedVol !== null && (!isFinite(parsedAssignedVol) || parsedAssignedVol < 0)) {
      return NextResponse.json({ error: "Khối lượng giao phải là số không âm" }, { status: 400 });
    }
    if (parsedCompletedVol !== null && (!isFinite(parsedCompletedVol) || parsedCompletedVol < 0)) {
      return NextResponse.json({ error: "Khối lượng hoàn thành phải là số không âm" }, { status: 400 });
    }

    const scores = calculateTaskScores({
      benchmarkScore: snapBenchmarkScore,
      conversionFactor: snapConversionFactor,
      assignedVolume: parsedAssignedVol,
      completedVolume: parsedCompletedVol,
    });

    const settings = await NotificationEngine.getSettings();

    const newTask = await prisma.task.create({
      data: {
        code: finalCode,
        title: title.trim(),
        field: field.trim(),
        assigneeId: finalAssigneeId,
        department: body.department || assigneeUser?.department || "Khám bệnh",
        deadline: parsedDeadline,
        priority: priority || "LOW",
        taskType: finalTaskType,
        status: finalStatus,
        taskSource: finalTaskSource,
        approvalStatus: finalApprovalStatus,
        approverId: finalApproverId,
        approvedAt: finalApprovedAt,
        createdById: user.id,
        result: result || null,
        notes: notes || null,
        evidenceSource: snapEvidenceSource,
        evidenceFiles: evidenceFiles ? (typeof evidenceFiles === "string" ? evidenceFiles : JSON.stringify(evidenceFiles)) : null,
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
          select: { id: true, fullName: true, email: true, department: true, workLocation: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true },
        },
        creator: {
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

    // Nếu là nhiệm vụ đột xuất viên chức tự tạo (chờ duyệt): gửi thông báo cho Cán bộ phụ trách bộ phận
    if (finalApprovalStatus === "PENDING") {
      try {
        const headWhere: any[] = [{ role: { in: ["ADMIN", "DIRECTOR"] } }];
        if (assigneeUser?.department) {
          headWhere.push({ role: "DEPARTMENT_HEAD", department: assigneeUser.department });
        }
        const recipients = await prisma.user.findMany({
          where: {
            OR: headWhere,
            status: "ACTIVE",
            id: { not: user.id },
          },
          select: { id: true },
        });
        if (recipients.length > 0) {
          await prisma.inAppNotification.createMany({
            data: recipients.map((r) => ({
              userId: r.id,
              taskId: newTask.id,
              title: "Nhiệm vụ đột xuất mới chờ phê duyệt",
              message: `Viên chức ${user.fullName} vừa đề xuất việc đột xuất "${newTask.title}" (Nguồn: ${finalTaskSource || "Đột xuất"}). Vui lòng phê duyệt để viên chức triển khai.`,
            })),
          });
        }
      } catch (e) {
        console.error("[Notification to Head Error]:", e);
      }
    }

    // Audit M11/H8: chỉ đồng bộ calendar và notification khi việc đã được duyệt
    if (finalApprovalStatus === "APPROVED") {
      if (settings.googleCalendarEnabled) {
        const eventId = await createGoogleCalendarEvent({
          id: "",
          code: finalCode,
          title: title.trim(),
          deadline: parsedDeadline,
          field: field.trim(),
          priority: priority || "LOW",
          taskType: finalTaskType,
          status: finalStatus,
          notes: notes || undefined,
        });
        if (eventId) {
          newTask.googleEventId = eventId;
          await prisma.task.update({ where: { id: newTask.id }, data: { googleEventId: eventId } });
        }
      }

      // Audit M1: chỉ đánh giá riêng task vừa tạo (thay vì quét toàn bộ bảng).
      NotificationEngine.evaluateTaskNow(newTask.id);
    }

    return NextResponse.json(newTask, { status: 201 });
  } catch (error: any) {
    console.error("[Tasks POST API Error]:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Mã công việc đã tồn tại (trùng lặp đồng thời). Vui lòng thử mã khác." }, { status: 409 });
    }
    return NextResponse.json({ error: "Lỗi khi tạo công việc" }, { status: 500 });
  }
}
