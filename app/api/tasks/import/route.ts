import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { NotificationEngine } from "@/lib/notification-engine";
import { APP_UTC_OFFSET_MS, fromLocalInputValue } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Giới hạn an toàn (audit M4): số dòng dữ liệu tối đa sau khi giải nén.
const MAX_ROWS = 5000;
const IMPORT_CHUNK_SIZE = 500;

// Helper function to normalize date from various Excel formats.
// Audit H7: mọi chuỗi naive được hiểu theo GIỜ VIỆT NAM (không phụ thuộc TZ server).
function parseExcelDate(val: any): Date | null {
  if (!val) return null;

  // cellDates:true -> đã là JS Date (instant).
  if (val instanceof Date) return val;

  // If numeric (Excel serial date number)
  if (typeof val === "number") {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y && parsed.m) {
      return new Date(
        Date.UTC(parsed.y, parsed.m - 1, parsed.d || 1, parsed.H || 0, parsed.M || 0, parsed.S || 0) - APP_UTC_OFFSET_MS
      );
    }
  }

  if (typeof val === "string") {
    const cleanStr = val.trim();

    // Try DD/MM/YYYY or DD/MM/YYYY HH:mm (mặc định giờ 17:00 nếu không có giờ)
    const ddmmyyyyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?$/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10);
      const year = parseInt(ddmmyyyyMatch[3], 10);
      const hour = ddmmyyyyMatch[4] ? parseInt(ddmmyyyyMatch[4], 10) : 17;
      const min = ddmmyyyyMatch[5] ? parseInt(ddmmyyyyMatch[5], 10) : 0;
      return new Date(Date.UTC(year, month - 1, day, hour, min, 0, 0) - APP_UTC_OFFSET_MS);
    }

    // Naive ISO/khác -> coi theo giờ Việt Nam; chuỗi có offset/Z parse trực tiếp.
    return fromLocalInputValue(cleanStr);
  }

  return null;
}

// Priority mapping
function parsePriority(val: any): "LOW" | "MEDIUM" | "HIGH" {
  if (!val) return "LOW";
  const str = String(val).trim().toUpperCase();
  if (str.includes("HIGH") || str.includes("RẤT GẤP") || str.includes("CAO")) return "HIGH";
  if (str.includes("MEDIUM") || str.includes("GẤP") || str.includes("TRUNG BÌNH")) return "MEDIUM";
  return "LOW";
}

// TaskType mapping
function parseTaskType(val: any): "RECURRING" | "AD_HOC" {
  if (!val) return "RECURRING";
  const str = String(val).trim().toUpperCase();
  if (str.includes("AD_HOC") || str.includes("ĐỘT XUẤT") || str.includes("DOT XUAT")) return "AD_HOC";
  return "RECURRING";
}

// Status mapping
function parseStatus(val: any): "TODO" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED" {
  if (!val) return "TODO";
  const str = String(val).trim().toUpperCase();
  if (str.includes("COMPLETED") || str.includes("HOÀN THÀNH")) return "COMPLETED";
  if (str.includes("IN_PROGRESS") || str.includes("ĐANG LÀM") || str.includes("ĐANG THỰC HIỆN")) return "IN_PROGRESS";
  if (str.includes("PAUSED") || str.includes("TẠM DỪNG")) return "PAUSED";
  if (str.includes("CANCELLED") || str.includes("HỦY")) return "CANCELLED";
  return "TODO";
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền Import công việc từ file Excel" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn file Excel để Import" }, { status: 400 });
    }

    // Giới hạn kích thước file upload tối đa 5MB (chống DoS / tràn RAM)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Dung lượng file vượt quá giới hạn cho phép (tối đa 5MB)" }, { status: 400 });
    }

    // Audit M4: kiểm tra định dạng file Excel.
    const fileName = (file.name || "").toLowerCase();
    const isExcel =
      /\.(xlsx|xls)$/.test(fileName) ||
      file.type.includes("spreadsheetml") ||
      file.type === "application/vnd.ms-excel";
    if (!isExcel) {
      return NextResponse.json({ error: "File phải là Excel (.xlsx / .xls)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

    if (!workbook.SheetNames.length) {
      return NextResponse.json({ error: "File Excel không chứa bảng dữ liệu hợp lệ" }, { status: 400 });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows.length) {
      return NextResponse.json({ error: "File Excel trống, không có dòng dữ liệu nào" }, { status: 400 });
    }

    // Audit M4: chặn file quá nhiều dòng (zip-bomb đã giải nén).
    if (rawRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Số dòng dữ liệu (${rawRows.length}) vượt quá giới hạn cho phép (tối đa ${MAX_ROWS} dòng)` },
        { status: 400 }
      );
    }

    // Get all registered users to map assignees by email or full name
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true },
    });

    const userMap = new Map<string, string>();
    for (const u of allUsers) {
      userMap.set(u.email.toLowerCase(), u.id);
      userMap.set(u.fullName.toLowerCase().trim(), u.id);
    }

    // Pre-fetch tất cả mã công việc đã tồn tại để kiểm tra trùng lặp trong bộ nhớ
    // thay vì N lần truy vấn DB riêng lẻ
    const existingCodes = new Set(
      (await prisma.task.findMany({ select: { code: true } })).map((t) => t.code)
    );

    const errors: string[] = [];
    let autoSeq = Date.now();

    // Bước 1: Validate tất cả các dòng, thu thập dữ liệu hợp lệ vào mảng batch
    const validTasks: {
      code: string;
      title: string;
      field: string;
      assigneeId: string;
      deadline: Date;
      priority: "LOW" | "MEDIUM" | "HIGH";
      taskType: "RECURRING" | "AD_HOC";
      status: "TODO" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
      notes: string | null;
    }[] = [];

    // Track các mã được tạo trong batch này để phát hiện trùng nội bộ
    const batchCodes = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowIndex = i + 2; // Row 1 is header

      // Flexible column key matching
      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          for (const rawKey of Object.keys(row)) {
            if (rawKey.trim().toLowerCase().includes(k.toLowerCase())) {
              return row[rawKey];
            }
          }
        }
        return "";
      };

      let code = String(getVal("mã", "code")).trim();
      const title = String(getVal("tiêu đề", "tên", "title")).trim();
      const field = String(getVal("lĩnh vực", "field", "nhóm")).trim() || "Chung";
      const assigneeInput = String(getVal("người thực hiện", "assignee", "người làm", "email")).trim();
      const rawDeadline = getVal("hạn", "deadline", "ngày");
      const priorityInput = getVal("ưu tiên", "priority");
      const taskTypeInput = getVal("loại công việc", "loại", "type");
      const statusInput = getVal("trạng thái", "status");
      const notes = String(getVal("ghi chú", "note", "nội dung")).trim();

      if (!title) {
        errors.push(`Dòng ${rowIndex}: Bỏ qua do thiếu Tiêu đề công việc.`);
        continue;
      }

      // Generate task code if missing
      if (!code) {
        autoSeq++;
        code = `TASK-IMP-${autoSeq.toString().slice(-5)}`;
      }

      // Check trùng mã với DB và trùng nội bộ trong cùng batch
      if (existingCodes.has(code) || batchCodes.has(code)) {
        errors.push(`Dòng ${rowIndex}: Mã công việc "${code}" đã tồn tại trên hệ thống.`);
        continue;
      }

      // Match assignee — Audit M5: chỉ khớp CHÍNH XÁC email hoặc họ tên.
      // Không dùng khớp chuỗi con, KHÔNG âm thầm gán cho admin đang import.
      let assigneeId: string | null = null;
      if (assigneeInput) {
        const matchedId = userMap.get(assigneeInput.toLowerCase());
        if (matchedId) {
          assigneeId = matchedId;
        } else {
          errors.push(`Dòng ${rowIndex}: Không tìm thấy người thực hiện "${assigneeInput}" (cần email hoặc họ tên chính xác).`);
          continue;
        }
      } else {
        errors.push(`Dòng ${rowIndex}: Thiếu "Người thực hiện" (cần email hoặc họ tên chính xác).`);
        continue;
      }

      // Parse deadline date
      let deadline = parseExcelDate(rawDeadline);
      if (!deadline) {
        // Deadline mặc định: 17:00 giờ Việt Nam sau 7 ngày (audit H7).
        const vnNow = new Date(Date.now() + APP_UTC_OFFSET_MS);
        const plus = new Date(vnNow.getTime() + 7 * 24 * 60 * 60 * 1000);
        deadline = new Date(
          Date.UTC(plus.getUTCFullYear(), plus.getUTCMonth(), plus.getUTCDate(), 17, 0, 0, 0) - APP_UTC_OFFSET_MS
        );
      }

      const priority = parsePriority(priorityInput);
      const taskType = parseTaskType(taskTypeInput);
      const status = parseStatus(statusInput);

      validTasks.push({
        code,
        title,
        field,
        assigneeId,
        deadline,
        priority,
        taskType,
        status,
        notes: notes || null,
      });
      batchCodes.add(code);
    }

    // Bước 2: Batch insert theo chunk (audit M4) — tránh vượt giới hạn bind
    // parameter của Postgres khi import hàng nghìn dòng; lỗi chunk dừng sớm,
    // giữ phần đã nhập + báo lỗi rõ ràng.
    let importedCount = 0;
    if (validTasks.length > 0) {
      for (let i = 0; i < validTasks.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = validTasks.slice(i, i + IMPORT_CHUNK_SIZE);
        try {
          const result = await prisma.task.createMany({ data: chunk });
          importedCount += result.count;
        } catch (chunkErr: any) {
          console.error("[Tasks Import chunk error]:", chunkErr?.message || chunkErr);
          const reason =
            chunkErr?.code === "P2002"
              ? "trùng mã công việc (với dữ liệu đang tồn tại hoặc nhập đồng thời)"
              : "lỗi cơ sở dữ liệu";
          errors.push(
            `Import dừng ở dòng ${i + 2}: ${reason}. Đã nhập ${importedCount}/${validTasks.length} dòng hợp lệ.`
          );
          break;
        }
      }
    }

    if (importedCount > 0) {
      NotificationEngine.evaluateAndTriggerNotifications().catch((err) => {
        console.error("[Import Notification Engine Error]:", err);
      });
    }

    return NextResponse.json({
      message: `Import thành công ${importedCount}/${rawRows.length} công việc!`,
      importedCount,
      totalRows: rawRows.length,
      errors,
    });
  } catch (error: any) {
    console.error("[Tasks Import API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi Import file Excel" }, { status: 500 });
  }
}
