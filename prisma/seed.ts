import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PILOT_DAN_SO_POSITION } from "../lib/standard-task";

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
}

export async function runSeed() {
  console.log("Starting seed process...");

  // Seed Standard Task Catalog
  await seedStandardTaskCatalog();

  // 1. Create or reset default settings
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

  // 2. Passwords
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  // 3. Create Admin
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

  // 4. Create Users
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

  const now = new Date();

  // Helper date calculations
  const addHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
  const subHours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  // 5. Tasks array
  const sampleTasks = [
    {
      code: "TASK-101",
      title: "Khắc phục sự cố Server Database Supabase",
      field: "Công nghệ thông tin",
      assigneeId: user1.id,
      deadline: subHours(48), // Overdue by 2 days
      priority: "HIGH" as const,
      status: "TODO" as const,
      result: null,
      notes: "Cần tối ưu connection pooling và index",
    },
    {
      code: "TASK-102",
      title: "Cập nhật tài liệu hợp đồng đối tác Zalo",
      field: "Pháp lý & Cấu hình",
      assigneeId: user1.id,
      deadline: addHours(2), // Due in 2 hours -> WARNING LOW (within 4h window)
      priority: "LOW" as const,
      status: "IN_PROGRESS" as const,
      result: "Đã soạn thảo xong 80% hợp đồng",
      notes: "Chờ duyệt từ phòng pháp chế",
    },
    {
      code: "TASK-103",
      title: "Thiết kế Banner chiến dịch Q3",
      field: "Marketing & Truyền thông",
      assigneeId: user2.id,
      deadline: addHours(12), // Due in 12 hours -> WARNING MEDIUM (within 24h window)
      priority: "MEDIUM" as const,
      status: "IN_PROGRESS" as const,
      result: null,
      notes: "Đang chờ ảnh từ bên dịch vụ",
    },
    {
      code: "TASK-104",
      title: "Báo cáo doanh thu quý 2 năm 2026",
      field: "Tài chính - Kế toán",
      assigneeId: user1.id,
      deadline: addHours(4), // Due today -> WARNING HIGH (within 48h window)
      priority: "HIGH" as const,
      status: "IN_PROGRESS" as const,
      result: null,
      notes: "Tổng hợp dữ liệu từ 3 chi nhánh",
    },
    {
      code: "TASK-105",
      title: "Kiểm tra an toàn bảo mật hệ thống API",
      field: "Công nghệ thông tin",
      assigneeId: user3.id,
      deadline: addHours(48), // Due in 2 days
      priority: "MEDIUM" as const,
      status: "TODO" as const,
      result: null,
      notes: "Rà soát JWT cookie và CORS policy",
    },
    {
      code: "TASK-106",
      title: "Bảo trì định kỳ máy chủ email",
      field: "Vận hành hệ thống",
      assigneeId: user2.id,
      deadline: addHours(120), // Due in 5 days
      priority: "LOW" as const,
      status: "PAUSED" as const,
      result: null,
      notes: "Tạm dừng do ưu tiên sự cố Database",
    },
    {
      code: "TASK-107",
      title: "Tổ chức họp giao ban đầu tháng",
      field: "Hành chính - Nhân sự",
      assigneeId: user3.id,
      deadline: subHours(24),
      priority: "LOW" as const,
      status: "COMPLETED" as const,
      result: "Đã hoàn thành tốt đẹp, 100% nhân sự tham gia",
      notes: null,
    },
    {
      code: "TASK-108",
      title: "Khảo sát mặt bằng chi nhánh mới",
      field: "Phát triển thị trường",
      assigneeId: user2.id,
      deadline: subHours(72),
      priority: "LOW" as const,
      status: "CANCELLED" as const,
      result: "Hủy theo quyết định của HĐQT",
      notes: "Lý do: Thay đổi chiến lược kinh doanh",
    },
  ];

  const fields = [
    "Công nghệ thông tin",
    "Pháp lý & Cấu hình",
    "Marketing & Truyền thông",
    "Tài chính - Kế toán",
    "Vận hành hệ thống",
    "Hành chính - Nhân sự",
    "Phát triển thị trường",
  ];
  const assignees = [user1, user2, user3];
  const priorities = ["LOW", "MEDIUM", "HIGH"] as const;
  const statuses = ["TODO", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] as const;

  // Keep the scenarios above, then add deterministic records so one seed action
  // always creates the 100 demo tasks promised by the product.
  const generatedTasks = Array.from({ length: 92 }, (_, index) => {
    const number = index + 109;
    const status = statuses[index % statuses.length];

    return {
      code: `TASK-${number}`,
      title: `Công việc mẫu ${number}`,
      field: fields[index % fields.length],
      assigneeId: assignees[index % assignees.length].id,
      deadline: addHours((index - 18) * 18),
      priority: priorities[index % priorities.length],
      status,
      result: status === "COMPLETED" ? `Đã hoàn thành công việc mẫu ${number}` : null,
      notes: `Dữ liệu kiểm thử cho công việc mẫu ${number}`,
    };
  });

  for (const t of [...sampleTasks, ...generatedTasks]) {
    await prisma.task.upsert({
      where: { code: t.code },
      update: {
        title: t.title,
        field: t.field,
        assigneeId: t.assigneeId,
        deadline: t.deadline,
        priority: t.priority,
        status: t.status,
        result: t.result,
        notes: t.notes,
      },
      create: t,
    });
  }

  console.log("Seed finished successfully!");
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
