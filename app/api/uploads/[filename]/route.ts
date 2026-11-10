import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".rtf": "application/rtf",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
};

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const rawName = decodeURIComponent(params.filename || "");
    const safeName = path.basename(rawName);
    if (!safeName || safeName !== rawName || safeName.startsWith(".")) {
      return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "uploads", safeName);
    const fileBuffer = await fs.readFile(filePath);
    const ext = path.extname(safeName).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    const isInline =
      contentType.startsWith("image/") ||
      contentType === "application/pdf" ||
      contentType.startsWith("text/");

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${encodeURIComponent(safeName)}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy file" }, { status: 404 });
  }
}
