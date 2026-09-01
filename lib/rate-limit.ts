/**
 * Rate limiter hỗ trợ 2 backend:
 *
 * 1. **Upstash Redis** (distributed): Tự động kích hoạt khi cấu hình
 *    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. Dùng lệnh INCR + PEXPIRE
 *    đảm bảo chặt chẽ giữa nhiều instance serverless (Vercel Multi-region).
 *    Giao tiếp qua REST API thuần (fetch) — không cần thêm package.
 *
 * 2. **In-memory** (fallback): Dùng khi chưa cấu hình Redis. Chỉ bảo vệ
 *    best-effort trên môi trường single-instance hoặc local dev.
 */

// ==========================================
// Upstash Redis Rate Limiter (distributed)
// ==========================================

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function redisCommand(...args: (string | number)[]): Promise<any> {
  const res = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Upstash Redis error: ${res.status}`);
  const data = await res.json();
  return data.result;
}

async function redisCheckRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const redisKey = `rl:${key}`;

  // Pipeline: INCR key rồi PTTL để đọc TTL còn lại
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PTTL", redisKey],
    ]),
  });

  if (!res.ok) throw new Error(`Upstash Redis pipeline error: ${res.status}`);
  const results: { result: number }[] = await res.json();

  const count = results[0].result;
  let ttlMs = results[1].result;

  // Key mới (lần INCR đầu tiên) — set TTL
  if (count === 1 || ttlMs < 0) {
    await redisCommand("PEXPIRE", redisKey, windowMs);
    ttlMs = windowMs;
  }

  if (count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

async function redisResetRateLimit(key: string): Promise<void> {
  await redisCommand("DEL", `rl:${key}`);
}

// ==========================================
// In-memory Rate Limiter (local fallback)
// ==========================================

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function memoryCheckRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) pruneExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function memoryResetRateLimit(key: string): void {
  buckets.delete(key);
}

// ==========================================
// Public API (tự động chọn backend)
// ==========================================

/**
 * Kiểm tra rate limit cho một key. Tự động dùng Redis nếu đã cấu hình,
 * ngược lại fallback về in-memory.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  if (useRedis) {
    try {
      return await redisCheckRateLimit(key, limit, windowMs);
    } catch (err) {
      // Redis lỗi => fallback về in-memory thay vì chặn request
      console.error("[Rate Limit] Redis fallback to in-memory:", err);
    }
  }
  return memoryCheckRateLimit(key, limit, windowMs);
}

/** Xóa bucket của một key (gọi khi hành động thành công, ví dụ đăng nhập đúng). */
export async function resetRateLimit(key: string): Promise<void> {
  if (useRedis) {
    try {
      await redisResetRateLimit(key);
      return;
    } catch (err) {
      console.error("[Rate Limit] Redis reset fallback:", err);
    }
  }
  memoryResetRateLimit(key);
}

/** Trích xuất IP an toàn của client từ request (Ưu tiên edge reverse proxies như Vercel/Cloudflare). */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return "unknown";
}
