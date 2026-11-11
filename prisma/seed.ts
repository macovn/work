import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateTaskScores } from "../lib/standard-task";
import { TYT_VTVL_POSITIONS, TYT_STAFF_D1, inferDepartmentFromStaff } from "../lib/tyt-caibau-data";

const prisma = new PrismaClient();

export async function seedStandardTaskCatalog() {
  console.log("Seeding VTVL & Standard Task Catalog (19 VTVL Bậc nghề nghiệp TYT Cái Bầu & QĐ 1399/QĐ-SYT)...");

  const positionMap = new Map<string, string>();
  let posOrder = 1;
  let taskOrder = 1;

  for (const posData of TYT_VTVL_POSITIONS) {
    const pos = await prisma.jobPosition.upsert({
      where: { code: posData.code },
      update: {
        name: posData.name,
        description: posData.description,
        careerRank: posData.careerRank,
        targetRatio: posData.targetRatio,
        approvedQuota: posData.approvedQuota,
        currentHeadcount: posData.currentHeadcount,
        standardHoursYear: posData.standardHoursYear,
        method: posData.method,
        isActive: true,
        order: posOrder++,
      },
      create: {
        code: posData.code,
        name: posData.name,
        description: posData.description,
        careerRank: posData.careerRank,
        targetRatio: posData.targetRatio,
        approvedQuota: posData.approvedQuota,
        currentHeadcount: posData.currentHeadcount,
        standardHoursYear: posData.standardHoursYear,
        method: posData.method,
        isActive: true,
        order: posOrder++,
      },
    });

    positionMap.set(posData.code, pos.id);

    let groupOrder = 1;
    for (const groupData of posData.groups) {
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
          order: groupOrder++,
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
            missionCodeA1: taskData.missionCodeA1 ?? null,
            productCode: taskData.productCode ?? null,
            annualVolume: taskData.annualVolume ?? null,
            standardMinutes: taskData.standardMinutes ?? null,
            extraHoursYear: taskData.extraHoursYear ?? 0,
            digitalSavedHours: taskData.digitalSavedHours ?? 0,
            evidenceSource: taskData.evidenceSource ?? null,
            isActive: true,
            order: taskOrder++,
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
            missionCodeA1: taskData.missionCodeA1 ?? null,
            productCode: taskData.productCode ?? null,
            annualVolume: taskData.annualVolume ?? null,
            standardMinutes: taskData.standardMinutes ?? null,
            extraHoursYear: taskData.extraHoursYear ?? 0,
            digitalSavedHours: taskData.digitalSavedHours ?? 0,
            evidenceSource: taskData.evidenceSource ?? null,
            isActive: true,
            order: taskOrder++,
          },
        });
      }
    }
  }

  // Deactivate legacy VT-DAN-SO if present so it doesn't duplicate VTVL.232.10.B3 / B2
  await prisma.jobPosition.updateMany({
    where: { code: "VT-DAN-SO" },
    data: { isActive: false },
  });

  console.log(`Seeded ${TYT_VTVL_POSITIONS.length} VTVL positions of Trạm Y tế Cái Bầu successfully.`);
  return positionMap;
}

export async function runSeed() {
  console.log("Starting seed process for Trạm Y tế Cái Bầu (HD 07-BTCTW & QĐ 1399/QĐ-SYT)...");

  // 1. Seed 19 VTVL Positions & Standard Task Catalog
  const positionMap = await seedStandardTaskCatalog();

  // 2. Default Notification Settings
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

  // 3. Seed all 67 Staff Members of Trạm Y tế Cái Bầu (Biểu D1)
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  const userByStaffCode = new Map<string, { id: string; fullName: string; email: string }>();

  for (const staff of TYT_STAFF_D1) {
    const posId = positionMap.get(staff.vtvlCode) || null;
    const isAdminAccount = staff.email === "admin@example.com";
    const passwordHash = isAdminAccount ? adminPassword : userPassword;
    const qualificationStr = `${staff.qualification} (${staff.currentRankCode})`;
    const dept = staff.department || inferDepartmentFromStaff(staff);

    const existing = await prisma.user.findUnique({
      where: { email: staff.email },
      select: { role: true, department: true },
    });

    const u = await prisma.user.upsert({
      where: { email: staff.email },
      update: {
        passwordHash,
        fullName: staff.fullName,
        staffCode: staff.staffCode,
        positionId: posId,
        qualification: qualificationStr,
        // Bảo vệ toàn vẹn phân cấp phân quyền và bộ phận đã thiết lập
        department: existing?.department || dept,
        workLocation: staff.workLocation,
        concurrentHours: staff.concurrentHours,
        role: existing?.role || staff.role,
        status: "ACTIVE",
      },
      create: {
        email: staff.email,
        passwordHash,
        fullName: staff.fullName,
        staffCode: staff.staffCode,
        positionId: posId,
        qualification: qualificationStr,
        department: dept,
        workLocation: staff.workLocation,
        concurrentHours: staff.concurrentHours,
        role: staff.role,
        status: "ACTIVE",
      },
    });

    userByStaffCode.set(staff.staffCode, u);
  }

  console.log(`Đã đồng bộ thông tin chức danh cho ${userByStaffCode.size} viên chức (bảo toàn phân quyền).`);

  // 4. Nếu đã có dữ liệu công việc trong DB thì giữ nguyên 100%, không xóa/reset
  const existingTaskCount = await prisma.task.count();
  if (existingTaskCount > 0) {
    console.log(`✓ Đã có ${existingTaskCount} công việc trong hệ thống, giữ nguyên toàn bộ dữ liệu thực tế.`);
    return;
  }

  const allStandardTasks = await prisma.standardTask.findMany({
    where: { isActive: true },
  });
  const stdMap = new Map(allStandardTasks.map((t) => [t.code, t]));

  const now = new Date();
  const addHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);
  const subHours = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  const adminUser = userByStaffCode.get("VC-10.2669")!; // Phạm Huy Cường - Giám đốc
  const pgdNguyen = userByStaffCode.get("VC-10.2670")!; // Trương Thái Nguyên - PGĐ (user1)
  const bsTuanAnh = userByStaffCode.get("VC-10.3703")!; // BS CKI Nguyễn Tuấn Anh (user2)
  const ddMinhHuong = userByStaffCode.get("VC-10.6692")!; // ĐD Nguyễn Thị Minh Hương (user3)
  const bsPhuongThao = userByStaffCode.get("VC-10.5325")!; // BS Nguyễn Thị Phương Thảo - PGĐ ĐT1
  const bsMacHao = userByStaffCode.get("VC-10.2064")!; // BS Mạc Thị Hảo
  const dsMaiPhuong = userByStaffCode.get("VC-33.10.003")!; // Bùi Mai Phương - Dân số Bậc 3
  const dsCamVan = userByStaffCode.get("VC-33.10.004")!; // Hoàng Thị Cẩm Vân - Dân số Bậc 2
  const duocCaoHuyen = userByStaffCode.get("VC-10.5251")!; // Cao Thị Huyền - Dược Bậc 3
  const duocPhamDuyen = userByStaffCode.get("VC-10.2580")!; // Phạm Thị Duyên - Dược Bậc 2 Methadone
  const ytccPhamHanh = userByStaffCode.get("VC-10.3157")!; // Phạm Thị Hạnh - YTCC Bậc 3
  const hsThanhThuy = userByStaffCode.get("VC-10.3660")!; // Nguyễn Thanh Thủy - Hộ sinh Bậc 3
  const cnttHuyenKhanh = userByStaffCode.get("VC-TYT-35")!; // Tẩy Huyền Khanh - CNTT Bậc 3
  const ktMinhHue = userByStaffCode.get("VC-10.3156")!; // Vũ Thị Minh Huệ - Kế toán Bậc 3
  const ctxhThuyHai = userByStaffCode.get("VC-10.3817")!; // Nguyễn Thị Thúy Hải - CTXH Bậc 3

  const tytTasks = [
    {
      stdCode: "CV.TYT.009",
      code: "TYT-2026-001",
      title: "Phê duyệt Đề án vị trí việc làm Trạm Y tế Cái Bầu giai đoạn 2027-2031 theo Hướng dẫn 07-HD/BTCTW",
      field: "Quản lý điều hành & Tổ chức cán bộ",
      assignee: adminUser,
      deadline: subHours(24),
      priority: "HIGH" as const,
      taskType: "AD_HOC" as const,
      status: "COMPLETED" as const,
      assignedVolume: 12,
      completedVolume: 12,
      result: "Đã hoàn thành Tờ trình, Đề án VTVL và Bộ 11 biểu mẫu HD07 trình UBND đặc khu Vân Đồn",
      notes: "136.860 giờ B1 - 3.300 giờ B2 = 133.560 giờ ròng (70,15 FTE -> 70 biên chế)",
      evidenceSource: "Hệ thống QLVB điện tử và Hồ sơ Đề án VTVL TYT Cái Bầu",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 100,
      kpiScore: 100,
      kpiComment: "Đề án chuẩn xác 100% theo HD 07-HD/BTCTW và Nghị định 232/2026/NĐ-CP",
    },
    {
      stdCode: "CV.TYT.010",
      code: "TYT-2026-002",
      title: "Triển khai chương trình kiểm tra, giám sát Đảng quý IV/2026 của UBKT Đảng ủy TYT Cái Bầu",
      field: "Công tác xây dựng Đảng (Kiêm nhiệm)",
      assignee: pgdNguyen,
      deadline: addHours(36),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 15,
      completedVolume: 12,
      result: "Đã ban hành kế hoạch và kiểm tra xong 2/3 Chi bộ trực thuộc",
      notes: "Hoàn thiện biên bản kiểm tra Chi bộ 3 trước kỳ sinh hoạt Đảng ủy tháng 11",
      evidenceSource: "Hồ sơ UBKT Đảng ủy (Quyết định 06-QĐ/ĐU và 12-QĐ/ĐU)",
    },
    {
      stdCode: "CV.TYT.001",
      code: "TYT-2026-003",
      title: "Khám chuyên khoa Sản phụ khoa, siêu âm thai và hội chẩn ca bệnh khó tại Trạm chính tháng 10/2026",
      field: "Khám chữa bệnh chuyên khoa",
      assignee: bsTuanAnh,
      deadline: subHours(12),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 250,
      completedVolume: 260,
      result: "Đã khám chuyên khoa và siêu âm cho 260/250 lượt người bệnh BHYT (đạt 104%)",
      notes: "Đảm bảo 100% quy trình kỹ thuật chuyên ngành Sản phụ khoa",
      evidenceSource: "Phần mềm khám chữa bệnh HIS & Cổng giám định BHYT",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 98,
      kpiScore: 99.4,
      kpiComment: "Vượt định mức khối lượng giao, chất lượng chẩn đoán tốt",
    },
    {
      stdCode: "CV.TYT.013",
      code: "TYT-2026-004",
      title: "Tổ chức tiêm chủng mở rộng định kỳ tháng 10/2026 (12 loại vắc xin) và giám sát phản ứng sau tiêm tại Trạm chính",
      field: "Y tế dự phòng - Tiêm chủng mở rộng",
      assignee: ddMinhHuong,
      deadline: subHours(18),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 180,
      completedVolume: 180,
      result: "Đã tiêm chủng an toàn 180/180 mũi vắc xin TCMR, cập nhật 100% lên Hệ thống TCMR Quốc gia",
      notes: "Không ghi nhận trường hợp phản ứng nặng sau tiêm",
      evidenceSource: "Hệ thống quản lý thông tin tiêm chủng quốc gia & Sổ tiêm chủng",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 97,
      kpiScore: 99.1,
      kpiComment: "Đảm bảo an toàn tiêm chủng tuyệt đối, dữ liệu đồng bộ kịp thời",
    },
    {
      stdCode: "CV.TYT.014",
      code: "TYT-2026-005",
      title: "Rà soát, đo huyết áp sàng lọc cộng đồng và làm sạch Hồ sơ sức khỏe điện tử toàn dân (đợt 3/2026)",
      field: "Quản lý sức khỏe toàn dân (43.141 dân)",
      assignee: ddMinhHuong,
      deadline: addHours(16),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 650,
      completedVolume: 520,
      result: "Đã chuẩn hóa 'đúng, đủ, sạch, sống' 520/650 hồ sơ sức khỏe điện tử nhân khẩu Khu 5, Khu 6",
      notes: "Còn 130 hồ sơ cần đối chiếu CCCD định danh mức 2",
      evidenceSource: "Phần mềm Hồ sơ sức khỏe điện tử toàn dân tỉnh Quảng Ninh",
    },
    {
      stdCode: "CV.TYT.002",
      code: "TYT-2026-006",
      title: "Điều hành hoạt động chuyên môn Điểm trạm 1 (Đoàn Kết) và báo cáo kết quả công tác Chi bộ 2",
      field: "Điều hành Điểm trạm & Công tác Đảng",
      assignee: bsPhuongThao,
      deadline: addHours(72),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 15,
      completedVolume: 10,
      result: "Đã duyệt lịch trực 24/24 Điểm trạm 1 và tổng hợp số liệu KCB tháng 10",
      notes: "Chuẩn bị báo cáo giao ban toàn Trạm",
      evidenceSource: "Sổ theo dõi văn bản Điểm trạm 1 & Sổ nghị quyết Chi bộ 2",
    },
    {
      stdCode: "CV.TYT.003",
      code: "TYT-2026-007",
      title: "Khám bệnh, kê đơn ngoại trú BHYT và khám định kỳ bệnh nhân điều trị thay thế Methadone",
      field: "Khám chữa bệnh BHYT & Methadone",
      assignee: bsMacHao,
      deadline: addHours(48),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 300,
      completedVolume: 245,
      result: "Đã khám và kê đơn BHYT 210 lượt, khám đánh giá liều Methadone 35 bệnh nhân",
      notes: "Theo dõi sát tuân thủ điều trị của bệnh nhân mới vào chương trình",
      evidenceSource: "Phần mềm HIS, Cổng BHYT & Hồ sơ bệnh án Methadone",
    },
    {
      stdCode: "CV.TYT.021",
      code: "TYT-2026-008",
      title: "Phân tích biến động dân số (43.141 nhân khẩu) và xây dựng kế hoạch nâng cao chất lượng dân số năm 2027",
      field: "Dân số & Phát triển",
      assignee: dsMaiPhuong,
      deadline: subHours(36),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 20,
      completedVolume: 20,
      result: "Hoàn thành báo cáo phân tích 43.141 dân, 351 trẻ sinh, 7.475 NCT trên toàn địa bàn Cái Bầu",
      notes: "Số liệu khớp 100% với Bộ biểu chỉ tiêu dân số 30/9/2026",
      evidenceSource: "Bộ biểu tổng hợp chỉ tiêu Dân số năm 2026 & Phần mềm MIS",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 96,
      kpiScore: 98.8,
      kpiComment: "Số liệu chính xác, phân tích sâu cơ cấu dân số theo 19 thôn/khu",
    },
    {
      stdCode: "CV.TYT.023",
      code: "TYT-2026-009",
      title: "Cập nhật biến động dân số vào kho dữ liệu MIS và lập hồ sơ khám sức khỏe định kỳ Người cao tuổi",
      field: "Dân số & Chăm sóc Người cao tuổi",
      assignee: dsCamVan,
      deadline: subHours(10),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 400,
      completedVolume: 350,
      result: "Đã nhập MIS 350/400 hồ sơ khám sức khỏe định kỳ Người cao tuổi",
      notes: "Đang rà soát 50 phiếu khám NCT từ Điểm trạm 3 chuyển về (Quá hạn nhẹ cần xử lý ngay)",
      evidenceSource: "Kho dữ liệu điện tử Dân số MIS & Hồ sơ sức khỏe NCT",
    },
    {
      stdCode: "CV.TYT.007",
      code: "TYT-2026-010",
      title: "Kiểm nhập, kiểm kê định kỳ thuốc BHYT, vắc xin dây chuyền lạnh GSP và thuốc Methadone tháng 10/2026",
      field: "Dược - Vật tư - Vắc xin",
      assignee: duocCaoHuyen,
      deadline: subHours(48),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 30,
      completedVolume: 30,
      result: "Đã hoàn thành 30 lô kiểm nhập/báo cáo xuất nhập tồn thuốc BHYT, vắc xin và Methadone",
      notes: "Đảm bảo 100% cơ số thuốc cấp cứu tại 05 điểm trạm",
      evidenceSource: "Phần mềm quản lý Dược & Biên bản kiểm kê kho GSP",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 98,
      kpiScore: 99.4,
      kpiComment: "Quản lý thuốc kiểm soát đặc biệt và vắc xin đúng quy chế Dược",
    },
    {
      stdCode: "CV.TYT.008",
      code: "TYT-2026-011",
      title: "Trực tiếp cấp phát thuốc điều trị thay thế Methadone hằng ngày và đối chiếu sổ thuốc kiểm soát đặc biệt",
      field: "Điều trị Methadone & Dược cơ sở",
      assignee: duocPhamDuyen,
      deadline: addHours(24),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 1500,
      completedVolume: 1420,
      result: "Đã cấp phát chính xác 1.420 lượt uống Methadone trong tháng, khớp 100% tồn kho thực tế",
      notes: "Duy trì trực cấp phát xuyên suốt cả Thứ Bảy, Chủ nhật",
      evidenceSource: "Sổ theo dõi cấp phát thuốc Methadone hằng ngày tại Cơ sở Methadone",
    },
    {
      stdCode: "CV.TYT.011",
      code: "TYT-2026-012",
      title: "Điều tra dịch tễ, giám sát véc-tơ Sốt xuất huyết và xử lý ổ dịch truyền nhiễm giao mùa",
      field: "Y tế dự phòng - Phòng chống dịch",
      assignee: ytccPhamHanh,
      deadline: addHours(60),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 18,
      completedVolume: 14,
      result: "Đã giám sát dịch tễ và phun hóa chất xử lý 14/18 điểm nguy cơ cao",
      notes: "Báo cáo nhanh trên Hệ thống giám sát bệnh truyền nhiễm TT 54/2015/TT-BYT",
      evidenceSource: "Hệ thống báo cáo bệnh truyền nhiễm TT 54/2015/TT-BYT & Sổ giám sát dịch",
    },
    {
      stdCode: "CV.TYT.017",
      code: "TYT-2026-013",
      title: "Quản lý thai nghén, tư vấn sàng lọc trước sinh - sơ sinh và dịch vụ KHHGĐ quý IV/2026",
      field: "Chăm sóc sức khỏe sinh sản",
      assignee: hsThanhThuy,
      deadline: addHours(96),
      priority: "LOW" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 220,
      completedVolume: 165,
      result: "Đã khám thai, tư vấn sàng lọc trước sinh - sơ sinh và KHHGĐ 165 lượt",
      notes: "Theo dõi sát các thai phụ nguy cơ cao trên địa bàn",
      evidenceSource: "Sổ khám thai, Sổ KHHGĐ và Bộ biểu chỉ tiêu SKSS 2026",
    },
    {
      stdCode: "CV.TYT.025",
      code: "TYT-2026-014",
      title: "Vận hành liên thông dữ liệu KCB BHYT chuẩn XML 4750 và số hóa, ký số văn bản đi - đến",
      field: "Ứng dụng CNTT & Chuyển đổi số",
      assignee: cnttHuyenKhanh,
      deadline: subHours(6),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "COMPLETED" as const,
      assignedVolume: 150,
      completedVolume: 150,
      result: "100% văn bản đi - đến được ký số; 100% hồ sơ KCB BHYT tại 05 điểm trạm đẩy cổng đúng hạn",
      notes: "Tiết kiệm 3.300 giờ/năm cho toàn đơn vị theo Biểu B2",
      evidenceSource: "Hệ thống QLVB điện tử & Cổng tiếp nhận dữ liệu giám định BHYT",
      kpiQuantity: 100,
      kpiProgress: 100,
      kpiQuality: 100,
      kpiScore: 100,
      kpiComment: "Hạ tầng HIS/BHYT thông suốt, minh chứng chuyển đổi số Biểu B2 rõ ràng",
    },
    {
      stdCode: "CV.TYT.026",
      code: "TYT-2026-015",
      title: "Tổng hợp hồ sơ thanh quyết toán chi phí KCB BHYT quý III/2026 và kiểm kê tài sản công 05 điểm trạm",
      field: "Tài chính - Kế toán",
      assignee: ktMinhHue,
      deadline: addHours(48),
      priority: "HIGH" as const,
      taskType: "RECURRING" as const,
      status: "IN_PROGRESS" as const,
      assignedVolume: 45,
      completedVolume: 38,
      result: "Đã đối chiếu khớp số liệu BHYT quý III và hoàn thành kiểm kê tài sản tại Trạm chính, ĐT1, ĐT2",
      notes: "Còn đối chiếu biên bản kiểm kê Điểm trạm 3 và Điểm trạm 4",
      evidenceSource: "Phần mềm Kế toán MISA & Cổng giám định BHYT",
    },
    {
      stdCode: "CV.TYT.024",
      code: "TYT-2026-016",
      title: "Lập hồ sơ quản lý sức khỏe đối tượng bảo trợ xã hội/NKT và tư vấn tâm lý bệnh nhân Methadone",
      field: "Công tác xã hội & Hành chính",
      assignee: ctxhThuyHai,
      deadline: addHours(120),
      priority: "MEDIUM" as const,
      taskType: "RECURRING" as const,
      status: "TODO" as const,
      assignedVolume: 140,
      completedVolume: 0,
      result: null,
      notes: "Triển khai theo Quy trình Công tác xã hội tại Trạm Y tế Cái Bầu",
      evidenceSource: "Hồ sơ đối tượng BTXH/NKT & Sổ tư vấn tâm lý Methadone",
    },
  ];

  for (const item of tytTasks) {
    const std = stdMap.get(item.stdCode);
    if (!std) {
      console.warn(`Warning: Standard task ${item.stdCode} not found.`);
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
        field: item.field,
        assigneeId: item.assignee.id,
        deadline: item.deadline,
        priority: item.priority,
        taskType: item.taskType,
        status: item.status,
        result: item.result,
        notes: item.notes,
        evidenceSource: item.evidenceSource,
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
          kpiEvaluatorId: adminUser.id,
          kpiEvaluatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 4),
          kpiComment: item.kpiComment,
        }),
      },
    });
  }

  console.log(`Seed finished successfully! Created ${tytTasks.length} realistic tasks for Trạm Y tế Cái Bầu.`);
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
