interface RateLimiterConfig {
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  key: string;
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  windowMs: number;
}

function readPositiveInt(name: string, fallback: number) {
  const rawValue = process.env[name];
  const parsed = Number.parseInt(rawValue || "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly config: RateLimiterConfig) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const bucket = this.getBucket(key, now);
    const allowed = bucket.count < this.config.limit;
    const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    return {
      key,
      allowed,
      limit: this.config.limit,
      remaining: allowed ? this.config.limit - bucket.count : 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
      windowMs: this.config.windowMs,
    };
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    const preview = this.check(key, now);
    if (!preview.allowed) {
      return preview;
    }

    const bucket = this.getBucket(key, now);
    bucket.count += 1;

    return {
      ...preview,
      remaining: Math.max(0, this.config.limit - bucket.count),
    };
  }

  reset(key?: string) {
    if (key) {
      this.buckets.delete(key);
      return;
    }

    this.buckets.clear();
  }

  getConfig() {
    return { ...this.config };
  }

  private getBucket(key: string, now: number) {
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const nextBucket = {
        count: 0,
        resetAt: now + this.config.windowMs,
      };
      this.buckets.set(key, nextBucket);
      return nextBucket;
    }

    return existing;
  }
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };
}

export class ClaudeRateLimitError extends Error {
  readonly name = "ClaudeRateLimitError";

  constructor(
    public readonly scope: "user" | "global",
    public readonly retryAfterSeconds: number,
    public readonly limit: number,
    public readonly resetAt: number
  ) {
    super(`Claude rate limit reached for ${scope} scope. Retry after ${retryAfterSeconds}s.`);
  }
}

const claudeWindowMs = readPositiveInt("CLAUDE_RATE_LIMIT_WINDOW_MS", 60_000);
const claudeUserLimiter = new FixedWindowRateLimiter({
  limit: readPositiveInt("CLAUDE_RATE_LIMIT_PER_USER", 3),
  windowMs: claudeWindowMs,
});
const claudeGlobalLimiter = new FixedWindowRateLimiter({
  limit: readPositiveInt("CLAUDE_RATE_LIMIT_GLOBAL", 20),
  windowMs: claudeWindowMs,
});
const jobCreationLimiter = new FixedWindowRateLimiter({
  limit: readPositiveInt("JOB_CREATE_RATE_LIMIT_MAX", 5),
  windowMs: readPositiveInt("JOB_CREATE_RATE_LIMIT_WINDOW_MS", 60_000),
});

export function reserveClaudeRateLimit(requesterId: string, now = Date.now()) {
  const requesterKey = requesterId || "anonymous";
  const globalPreview = claudeGlobalLimiter.check("global", now);
  if (!globalPreview.allowed) {
    throw new ClaudeRateLimitError(
      "global",
      globalPreview.retryAfterSeconds,
      globalPreview.limit,
      globalPreview.resetAt
    );
  }

  const userPreview = claudeUserLimiter.check(requesterKey, now);
  if (!userPreview.allowed) {
    throw new ClaudeRateLimitError(
      "user",
      userPreview.retryAfterSeconds,
      userPreview.limit,
      userPreview.resetAt
    );
  }

  claudeGlobalLimiter.consume("global", now);
  return claudeUserLimiter.consume(requesterKey, now);
}

export function consumeJobCreationRateLimit(requesterId: string, now = Date.now()) {
  return jobCreationLimiter.consume(requesterId || "anonymous", now);
}

export function getRateLimiterConfig() {
  return {
    claude: {
      per_user: claudeUserLimiter.getConfig(),
      global: claudeGlobalLimiter.getConfig(),
    },
    jobs: {
      create: jobCreationLimiter.getConfig(),
    },
  };
}

export function resetRateLimitersForTests() {
  claudeUserLimiter.reset();
  claudeGlobalLimiter.reset();
  jobCreationLimiter.reset();
}