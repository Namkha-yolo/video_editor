import Redis from "ioredis";

export const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.warn("Redis unavailable - running without job queue");
      return null;
    }

    return Math.min(times * 50, 2000);
  },
};

export function createRedisConnection() {
  const client = new Redis(redisUrl, redisOptions);

  client.on("error", (error: any) => {
    if (error?.code !== "ECONNREFUSED") {
      console.error("Redis error:", error.message);
    }
  });

  return client;
}

export const redis = createRedisConnection();

redis.connect().catch(() => {
  console.warn("Redis not available - job queue disabled");
});
