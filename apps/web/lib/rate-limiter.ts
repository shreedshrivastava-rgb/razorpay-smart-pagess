const CLEANUP_INTERVAL_MS = 60_000;
const MAX_MAP_SIZE = 10_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

type RateLimitBackend = "memory" | "redis";

function getBackend(): RateLimitBackend {
  if (process.env.KV_URL || process.env.KV_REST_API_URL) {
    return "redis";
  }
  return "memory";
}

async function getKvClient() {
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

class MemoryRateLimiter {
  private maps = new Map<string, Map<string, RateLimitEntry>>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  getMap(name: string): Map<string, RateLimitEntry> {
    let m = this.maps.get(name);
    if (!m) {
      m = new Map();
      this.maps.set(name, m);
    }
    return m;
  }

  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [, map] of this.maps) {
        for (const [key, entry] of map) {
          if (now > entry.resetAt) map.delete(key);
        }
      }
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

const memoryInstance = new MemoryRateLimiter();
memoryInstance.startCleanup();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
}

export interface RateLimiterConfig {
  name: string;
  maxRequests: number;
  windowMs: number;
}

let kvClient: Awaited<ReturnType<typeof getKvClient>> | null = null;

async function checkRedis(
  name: string,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    if (!kvClient) kvClient = await getKvClient();
    if (!kvClient) {
      return checkMemory(name, key, maxRequests, windowMs);
    }
    const redisKey = `ratelimit:${name}:${key}`;
    const count = await kvClient.incr(redisKey);
    if (count === 1) {
      await kvClient.pexpire(redisKey, windowMs);
    }
    const ttl = await kvClient.pttl(redisKey);
    const allowed = count <= maxRequests;
    return {
      allowed,
      retryAfterSeconds: Math.ceil(Math.max(0, ttl) / 1000),
      remaining: Math.max(0, maxRequests - count),
      limit: maxRequests,
    };
  } catch {
    return checkMemory(name, key, maxRequests, windowMs);
  }
}

function checkMemory(
  name: string,
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const map = memoryInstance.getMap(name);

  if (map.size >= MAX_MAP_SIZE) {
    const now = Date.now();
    let evicted = 0;
    for (const [k, entry] of map) {
      if (now > entry.resetAt) {
        map.delete(k);
        evicted++;
        if (evicted > MAX_MAP_SIZE / 4) break;
      }
    }
    if (map.size >= MAX_MAP_SIZE) {
      const oldest = [...map.entries()].sort(
        (a, b) => a[1].resetAt - b[1].resetAt
      );
      const toRemove = Math.ceil(map.size * 0.25);
      for (let i = 0; i < toRemove && i < oldest.length; i++) {
        map.delete(oldest[i][0]);
      }
    }
  }

  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    map.set(key, entry);
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000), remaining: maxRequests - 1, limit: maxRequests };
  }

  if (entry.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds, remaining: 0, limit: maxRequests };
  }

  entry.count++;
  return { allowed: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000), remaining: maxRequests - entry.count, limit: maxRequests };
}

export async function checkRateLimit(
  name: string,
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  const backend = getBackend();
  if (backend === "redis") {
    return checkRedis(name, key, maxRequests, windowMs);
  }
  return checkMemory(name, key, maxRequests, windowMs);
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "Retry-After": String(result.retryAfterSeconds),
  };
}
