process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
process.env.AI_PIPELINE_URL = process.env.AI_PIPELINE_URL || "http://127.0.0.1:8000";

async function main() {
  const [{ run: runMoodEngineTests }, { run: runJobQueueTests }, { run: runVideoProcessorTests }] =
    await Promise.all([
      import("./moodEngine.test.mjs"),
      import("./jobQueue.test.mjs"),
      import("./videoProcessor.test.mjs"),
    ]);

  const results = [
    await runMoodEngineTests(),
    await runJobQueueTests(),
    await runVideoProcessorTests(),
  ];

  const passed = results.reduce((total, result) => total + result.passed, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);

  const [{ shutdownJobQueue }, { redis }] = await Promise.all([
    import("../dist/server/src/services/jobQueue.js"),
    import("../dist/server/src/config/redis.js"),
  ]);

  await shutdownJobQueue();
  await redis.quit();

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
