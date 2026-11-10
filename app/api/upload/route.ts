import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
  ".zip",
  ".rar",
  ".7z",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function sanitizeBaseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const rawFiles = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((f): f is File => f instanceof File && f.size > 0);

    if (rawFiles.length === 0) {
      return NextResponse.json({ error: "Vui lòng chọn ít nhất 1 file để tải lên" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const uploadedFiles: {
      name: string;
      url: string;
      size: number;
      type: string;
      uploadedAt: string;
    }[] = [];

    for (const file of rawFiles) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" vượt quá dung lượng tối đa 25MB` },
          { status: 400 }
        );
      }

      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          {
            error: `Định dạng file "${ext || file.name}" không được hỗ trợ. Chỉ chấp nhận Ảnh, PDF, Word, Excel, PowerPoint, Text, ZIP/RAR.`,
          },
          { status: 400 }
        );
      }

      const baseName = path.basename(file.name, path.extname(file.name));
      const safeBase = sanitizeBaseName(baseName) || "file";
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}${ext}`;
      const fullPath = path.join(uploadDir, storedName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(fullPath, buffer);

      uploadedFiles.push({
        name: file.name,
        url: `/api/uploads/${encodeURIComponent(storedName)}`,
        size: file.size,
        type: file.type || ext.replace(".", "").toUpperCase(),
        uploadedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ files: uploadedFiles });
  } catch (error: any) {
    console.error("[Upload API Error]:", error);
    return NextResponse.json({ error: "Lỗi khi tải file lên hệ thống" }, { status: 500 });
  }
}
