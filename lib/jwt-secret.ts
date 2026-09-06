/**
 * Nguồn duy nhất cho JWT_SECRET, dùng chung giữa middleware (Edge runtime)
 * và lib/auth.ts (Node runtime). Chỉ dùng process.env + TextEncoder để
 * đảm bảo tương thích Edge.
 */
const DEV_LOCAL_SECRET = "qlcv-dev-secret-key-local-only-not-for-production-use";

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    // Audit fix H3: trước đây fallback về secret ngẫu nhiên theo tiến trình —
    // Edge middleware và Node runtime (và mỗi cold start) sinh khóa khác nhau
    // => 401 hàng loạt, toàn bộ phiên bị vô hiệu khi deploy. Fail nhanh để lộ rõ
    // lỗi cấu hình thay vì thoái hóa im lặng.
    console.error(
      "[CRITICAL SECURITY ERROR]: JWT_SECRET is not configured in production environment variables!"
    );
    throw new Error(
      "[Fatal] JWT_SECRET is not configured in production. Set a stable JWT_SECRET (e.g. openssl rand -hex 32) before starting the app."
    );
  }

  return DEV_LOCAL_SECRET;
}

export function getJwtSecretString(): string {
  return requireSecret();
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(requireSecret());
}
