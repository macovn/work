import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sampleData = [
      {
        "Mã công việc": "TASK-201",
        "Tiêu đề công việc": "Khảo sát và lập kế hoạch bảo trì máy chủ Q4",
        "Lĩnh vực": "Công nghệ thông tin",
        "Người thực hiện (Email/Tên)": "user1@example.com",
        "Hạn hoàn thành (YYYY-MM-DD)": "2026-09-15 17:00",
        "Loại công việc (RECURRING/AD_HOC)": "RECURRING",
        "Độ ưu tiên (LOW/MEDIUM/HIGH)": "HIGH",
        "Trạng thái (TODO/IN_PROGRESS/COMPLETED)": "TODO",
        "Ghi chú": "Cần phối hợp với đội vận hành hệ thống",
      },
      {
        "Mã công việc": "TASK-202",
        "Tiêu đề công việc": "Soạn thảo báo cáo tài chính quý 3",
        "Lĩnh vực": "Tài chính - Kế toán",
        "Người thực hiện (Email/Tên)": "user2@example.com",
        "Hạn hoàn thành (YYYY-MM-DD)": "2026-09-30 12:00",
        "Loại công việc (RECURRING/AD_HOC)": "AD_HOC",
        "Độ ưu tiên (LOW/MEDIUM/HIGH)": "MEDIUM",
        "Trạng thái (TODO/IN_PROGRESS/COMPLETED)": "IN_PROGRESS",
        "Ghi chú": "Tổng hợp dữ liệu từ 5 chi nhánh",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    
    // Set column widths for readability
    worksheet["!cols"] = [
      { wch: 15 }, // Code
      { wch: 45 }, // Title
      { wch: 25 }, // Field
      { wch: 30 }, // Assignee
      { wch: 25 }, // Deadline
      { wch: 30 }, // Task Type
      { wch: 25 }, // Priority
      { wch: 30 }, // Status
      { wch: 35 }, // Notes
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CongViecMau");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Mau_Import_Cong_Viec.xlsx"',
      },
    });
  } catch (error: any) {
    console.error("[Template API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi tạo file mẫu Excel" }, { status: 500 });
  }
}
