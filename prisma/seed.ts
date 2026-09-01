import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PILOT_DAN_SO_POSITION, calculateTaskScores } from "../lib/standard-task";

const prisma = new PrismaClient();

export async function seedStandardTaskCatalog() {
  console.log("Seeding Standard Task Catalog (Pilot Dân số)...");

  // 1. Upsert Position
  const pos = await prisma.jobPosition.upsert({
    where: { code: PILOT_DAN_SO_POSITION.code },
    update: {
      name: PILOT_DAN_SO_POSITION.name,
      description: PILOT_DAN_SO_POSITION.description,
      isActive: true,
    },
    create: {
      code: PILOT_DAN_SO_POSITION.code,
      name: PILOT_DAN_SO_POSITION.name,
      description: PILOT_DAN_SO_POSITION.description,
      isActive: true,
      order: 1,
    },
  });

  // 2. Upsert Groups & Standard Tasks
  let groupOrder = 1;
  let taskOrder = 1;

  for (const groupData of PILOT_DAN_SO_POSITION.groups) {
    const group = await prisma.jobTaskGroup.upsert({
      where: {
        positionId_code: {
          positionId: pos.id,
          code: groupData.code,
        },
      },
      update: {
        name: groupData.name,
        weight: groupData.weight,
        isActive: true,
      },
      create: {
        positionId: pos.id,
        code: groupData.code,
        name: groupData.name,
        weight: groupData.weight,
        isActive: true,
        order: groupOrder++,
      },
    });

    for (const taskData of groupData.tasks) {
      await prisma.standardTask.upsert({
        where: { code: taskData.code },
        update: {
          positionId: pos.id,
          groupId: group.id,
          name: taskData.name,
          unit: taskData.unit,
          benchmarkScore: taskData.benchmarkScore,
          complexityLevel: taskData.complexityLevel,
          conversionFactor: taskData.conversionFactor,
          isActive: true,
        },
        create: {
          positionId: pos.id,
          groupId: group.id,
          code: taskData.code,
          name: taskData.name,
          unit: taskData.unit,
          benchmarkScore: taskData.benchmarkScore,
          complexityLevel: taskData.complexityLevel,
          conversionFactor: taskData.conversionFactor,
          isActive: true,
          order: taskOrder++,
        },
      });
    }
  }

  console.log("Seeded 14 Standard Tasks for Pilot Dân số successfully.");
  return pos;
}

export async function runSeed() {
  console.log("Starting seed process...");

  // 1. Seed Standard Task Catalog
  const position = await seedStandardTaskCatalog();

  // 2. Create or reset default settings
  await prisma.notificationSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      priorityLowHours: 4,
      priorityMediumHours: 24,
      priorityHighHours: 48,
      enableEmail: true,
      enableZalo: true,
      enablePush: true,
      googleCalendarEnabled: true,
    },
  });

  // 3. Passwords & Users
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "ADMIN" },
    create: {
      email: "admin@example.com",
      passwordHash: adminPassword,
      fullName: "Nguyễn Văn Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: "user1@example.com" },
    update: {},
    create: {
      email: "user1@example.com",
      passwordHash: userPassword,
      fullName: "Trần Văn Nhân Viên 1",
      role: "USER",
      status: "ACTIVE",
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "user2@example.com" },
    update: {},
    create: {
      email: "user2@example.com",
      passwordHash: userPassword,
      fullName: "Lê Thị Nhân Viên 2",
      role: "USER",
      status: "ACTIVE",
    },
  });

  const user3 = await prisma.user.upsert({
    where: { email: "user3@example.com" },
    update: {},
    create: {
      email: "user3@example.com",
      passwordHash: userPassword,
      fullName: "Phạm Hoàng Nhân Viên 3",
      role: "USER",
      status: "ACTIVE",
    },
  });

  // 4. XÓA TOÀN BỘ CÔNG VIỆC MẪU CŨ
  console.log("Xóa toàn bộ công việc cũ để nạp mới 14 công việc mẫu chuẩn Dân số...");
  await prisma.task.deleteMany({});

  // 5. Query 14 Standard Tasks from DB
  const standardTasks = await prisma.standardTask.findMany({
    where: { positionId: position.id },
    orderBy: { code: "asc" },
  });

  const stdMap = new Map(standardTasks.map((t) => [t.code, t]));

  const now = new Date();
  const addHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
  const subHours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  // 6. Định nghĩa 14 Công việc mẫu thực tế tương ứng chính xác 14 Công việc/Sản phẩm chuẩn
  const pilotTasksDefinition = [
    // --- NHÓM 1: Thu thập và quản trị dữ liệu dân số (25%) ---
    {
      stdCode: "DS-01",
      code: "DS-TASK-01",
      title: "Thu thập thông tin biến động dân số Phường Bến Nghé quý 3",
      assignee: user1,
      deadline: addHours(4), // Sắp đến hạn hôm nay
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 20,
      completedVolume: 15,
      result: "Đã thu thập và lập 15/20 phiếu/bộ dữ liệu thực địa",
      notes: "Ưu tiên hoàn tất 5 bộ dữ liệu còn lại trước 17h hôm nay",
    },
    {
      stdCode: "DS-02",
      code: "DS-TASK-02",
      title: "Nhập và cập nhật dữ liệu dân số hộ gia đình đợt 1/2026",
      assignee: user1,
      deadline: addHours(48),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 10,
      completedVolume: 4,
      result: "Đã nhập 4 bộ dữ liệu vào phần mềm chuyên ngành",
      notes: "Chờ kiểm tra chéo với dữ liệu tư pháp",
    },
    {
      stdCode: "DS-03",
      code: "DS-TASK-03",
      title: "Kiểm tra và làm sạch dữ liệu biến động nhân khẩu tháng 8",
      assignee: user2,
      deadline: subHours(12), // Hoàn thành đúng hạn gần đây
      priority: "LOW" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 5,
      completedVolume: 5,
      result: "Đã rà soát và làm sạch 100% 5/5 bộ dữ liệu, phát hiện và sửa 12 lỗi trùng lặp",
      notes: "Dữ liệu đã sẵn sàng để tổng hợp báo cáo",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 98,
      kpiScore: 99.4,
      kpiComment: "Thực hiện kỹ lưỡng, độ chính xác dữ liệu rất cao",
    },
    {
      stdCode: "DS-04",
      code: "DS-TASK-04",
      title: "Tổng hợp báo cáo số liệu dân số quý II năm 2026",
      assignee: user2,
      deadline: subHours(24),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 2,
      completedVolume: 2,
      result: "Đã hoàn thành 2 bản báo cáo tổng hợp quý gửi Sở Y tế và Chi cục Dân số",
      notes: "Báo cáo được cấp trên phê duyệt ngay trong lần nộp đầu tiên",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 95,
      kpiScore: 98.5,
      kpiComment: "Báo cáo đầy đủ, biểu đồ trực quan và đúng hạn",
    },

    // --- NHÓM 2: Thống kê, phân tích và dự báo dân số (45%) ---
    {
      stdCode: "DS-05",
      code: "DS-TASK-05",
      title: "Phân tích chuyên sâu biến động dân số 6 tháng đầu năm",
      assignee: user3,
      deadline: addHours(24),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 1,
      completedVolume: 0.8,
      result: "Đã hoàn thành dự thảo phần phân tích di dân và tăng tự nhiên (80%)",
      notes: "Cần bổ sung so sánh với cùng kỳ năm 2025",
    },
    {
      stdCode: "DS-06",
      code: "DS-TASK-06",
      title: "Phân tích cơ cấu độ tuổi và giới tính trên địa bàn quận",
      assignee: user1,
      deadline: addHours(72),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "TODO" as const,
      assignedVolume: 1,
      completedVolume: 0,
      result: null,
      notes: "Chuẩn bị nguồn số liệu điều tra mẫu",
    },
    {
      stdCode: "DS-07",
      code: "DS-TASK-07",
      title: "Chuyên đề phân tích chỉ tiêu mức sinh và mất cân bằng giới tính khi sinh",
      assignee: user2,
      deadline: subHours(48), // Quá hạn
      priority: "HIGH" as const,
      taskType: "AD_HOC" as const,
      status: "TODO" as const,
      assignedVolume: 1,
      completedVolume: 0,
      result: null,
      notes: "Quá hạn do đang chờ số liệu xác minh từ bệnh viện phụ sản",
    },
    {
      stdCode: "DS-08",
      code: "DS-TASK-08",
      title: "Dự báo quy mô và nhu cầu dịch vụ dân số giai đoạn 2026-2030",
      assignee: user3,
      deadline: addHours(120),
      priority: "HIGH" as const,
      taskType: "AD_HOC" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 1,
      completedVolume: 0.5,
      result: "Đã chạy xong mô hình dự báo dân số theo phương pháp thành phần",
      notes: "Đang viết báo cáo thuyết minh kết quả",
    },
    {
      stdCode: "DS-12",
      code: "DS-TASK-09",
      title: "Tổ chức điều tra khảo sát dân số thực tế tại địa bàn trọng điểm",
      assignee: user1,
      deadline: subHours(36),
      priority: "MEDIUM" as const,
      taskType: "AD_HOC" as const,
      status: "COMPLETED" as const,
      assignedVolume: 2,
      completedVolume: 2,
      result: "Đã hoàn thành 2 cuộc điều tra thực tế tại 2 khu phố đông dân cư",
      notes: "Tỷ lệ phản hồi đạt 96.5%",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 92,
      kpiScore: 97.6,
      kpiComment: "Tổ chức chu đáo, dữ liệu điều tra tin cậy",
    },
    {
      stdCode: "DS-13",
      code: "DS-TASK-10",
      title: "Lập báo cáo chuyên đề thực trạng già hóa dân số và an sinh xã hội",
      assignee: user2,
      deadline: addHours(168),
      priority: "LOW" as const,
      taskType: "RECURRING" as const,
      status: "TODO" as const,
      assignedVolume: 1,
      completedVolume: 0,
      result: null,
      notes: "Phối hợp với phòng Lao động - Thương binh và Xã hội",
    },

    // --- NHÓM 3: Kế hoạch, chương trình và đề án dân số (30%) ---
    {
      stdCode: "DS-09",
      code: "DS-TASK-11",
      title: "Xây dựng kế hoạch công tác dân số và phát triển năm 2027",
      assignee: user3,
      deadline: addHours(96),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 2,
      completedVolume: 1,
      result: "Đã hoàn thành Kế hoạch tổng thể đợt 1, đang xây dựng kế hoạch phân bổ kinh phí",
      notes: "Trình lãnh đạo ký duyệt dự thảo lần 1",
    },
    {
      stdCode: "DS-10",
      code: "DS-TASK-12",
      title: "Xây dựng chương trình truyền thông dân số và sức khỏe sinh sản quý IV",
      assignee: user1,
      deadline: addHours(144),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "TODO" as const,
      assignedVolume: 1,
      completedVolume: 0,
      result: null,
      notes: "Chuẩn bị tài liệu và kịch bản truyền thông cơ sở",
    },
    {
      stdCode: "DS-11",
      code: "DS-TASK-13",
      title: "Báo cáo đánh giá kết quả thực hiện chương trình mục tiêu dân số năm 2026",
      assignee: user2,
      deadline: subHours(96),
      priority: "LOW" as const,
      taskType: "AD_HOC" as const,
      status: "CANCELLED" as const,
      assignedVolume: 1,
      completedVolume: 0,
      result: "Hủy nhiệm vụ theo công văn điều chỉnh chương trình mục tiêu của UBND",
      notes: "Chuyển nội dung sang lồng ghép vào báo cáo tổng kết năm",
    },
    {
      stdCode: "DS-14",
      code: "DS-TASK-14",
      title: "Xây dựng Đề án nâng cao chất lượng dân số và tầm vóc địa phương giai đoạn 2026-2030",
      assignee: user3,
      deadline: subHours(20),
      priority: "HIGH" as const,
      taskType: "AD_HOC" as const,
      status: "COMPLETED" as const,
      assignedVolume: 1,
      completedVolume: 1,
      result: "Đã hoàn thành toàn bộ hồ sơ Đề án, thẩm định và được HĐND/UBND thông qua",
      notes: "Đề án trọng điểm cấp tỉnh/thành phố",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 100,
      kpiScore: 100,
      kpiComment: "Đề án xuất sắc, có tính khả thi và tác động xã hội lớn",
    },
  ];

  for (const item of pilotTasksDefinition) {
    const std = stdMap.get(item.stdCode);
    if (!std) {
      console.warn(`Warning: Standard task with code ${item.stdCode} not found.`);
      continue;
    }

    const scores = calculateTaskScores({
      benchmarkScore: std.benchmarkScore,
      conversionFactor: std.conversionFactor,
      assignedVolume: item.assignedVolume,
      completedVolume: item.completedVolume,
    });

    await prisma.task.create({
      data: {
        code: item.code,
        title: item.title,
        field: "Dân số & Phát triển",
        assigneeId: item.assignee.id,
        deadline: item.deadline,
        priority: item.priority,
        taskType: item.taskType,
        status: item.status,
        result: item.result,
        notes: item.notes,
        positionId: std.positionId,
        groupId: std.groupId,
        standardTaskId: std.id,
        unit: std.unit,
        benchmarkScore: std.benchmarkScore,
        complexityLevel: std.complexityLevel,
        conversionFactor: std.conversionFactor,
        assignedVolume: item.assignedVolume,
        completedVolume: item.completedVolume,
        assignedScore: scores.assignedScore,
        completedScore: scores.completedScore,
        completionRate: scores.completionRate,
        ...(item.kpiScore !== undefined && {
          kpiQuantity: item.kpiQuantity,
          kpiProgress: item.kpiProgress,
          kpiQuality: item.kpiQuality,
          kpiScore: item.kpiScore,
          kpiEvaluatorId: admin.id,
          kpiEvaluatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 6),
          kpiComment: item.kpiComment,
        }),
      },
    });
  }

  console.log("Seed finished successfully! 14 sample tasks for Pilot Dân số created.");
}

if (require.main === module) {
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
