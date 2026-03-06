import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: (times) => {
      // Stop retrying after 3 attempts
      if (times > 3) {
        console.warn("❌ Redis unavailable - running without job queue");
        return null;
      }
      return Math.min(times * 50, 2000);
    },
});

// Handle Redis connection errors gracefully
redis.on('error', (error: any) => {
  if (error.code === 'ECONNREFUSED') {
    // Suppress ECONNREFUSED errors as they're expected when Redis isn't running
  } else {
    console.error('Redis error:', error.message);
  }
});

// Attempt to connect but don't crash if it fails
redis.connect().catch(() => {
  console.warn("⚠️  Redis not available - job queue disabled");
});
