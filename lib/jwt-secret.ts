/**
 * Nguồn duy nhất cho JWT_SECRET, dùng chung giữa middleware (Edge runtime)
 * và lib/auth.ts (Node runtime). Chỉ dùng process.env + TextEncoder để
 * đảm bảo tương thích Edge.
 */
const DEV_FALLBACK_SECRET = "default-secret-qlcv-key";

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not defined in Production!");
    }
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
