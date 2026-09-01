/**
 * Nguồn duy nhất cho JWT_SECRET, dùng chung giữa middleware (Edge runtime)
 * và lib/auth.ts (Node runtime). Chỉ dùng process.env + TextEncoder để
 * đảm bảo tương thích Edge.
 */
let ephemeralRuntimeSecret: string | null = null;

function getEphemeralSecret(): string {
  if (!ephemeralRuntimeSecret) {
    const array = new Uint8Array(32);
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < 32; i++) array[i] = Math.floor(Math.random() * 256);
    }
    ephemeralRuntimeSecret = Array.from(array)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return ephemeralRuntimeSecret;
}

const DEV_LOCAL_SECRET = "qlcv-dev-secret-key-local-only-not-for-production-use";

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[CRITICAL SECURITY WARNING]: JWT_SECRET is not configured in production environment variables! " +
        "Using an ephemeral cryptographically random key. For session persistence across server restarts, please set JWT_SECRET."
    );
    return getEphemeralSecret();
  }

  return DEV_LOCAL_SECRET;
}

export function getJwtSecretString(): string {
  return requireSecret();
}

export function getJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(requireSecret());
}
