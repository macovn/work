/**
 * Nguồn duy nhất cho JWT_SECRET, dùng chung giữa middleware (Edge runtime)
 * và lib/auth.ts (Node runtime). Chỉ dùng process.env + TextEncoder để
 * đảm bảo tương thích Edge.
 */
const DEV_FALLBACK_SECRET = "default-secret-qlcv-production-fallback-key-2026";

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.warn("[Security Warning]: JWT_SECRET is not configured in environment variables. Using fallback secret.");
    return DEV_FALLBACK_SECRET;
  }
  return secret;
}

export function getJwtSecretString(): string {
  return requireSecret();
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(requireSecret());
}
