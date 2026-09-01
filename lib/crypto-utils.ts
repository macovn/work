import crypto from "crypto";

/**
 * So sánh chuỗi an toàn về timing (tránh timing attack khi so sánh secret).
 * Hai chuỗi có độ dài khác nhau vẫn trả về false mà không làm lộ thông tin độ dài mong đợi.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    // Vẫn thực hiện một phép so sánh để thời gian xử lý không phụ thuộc độ dài
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
