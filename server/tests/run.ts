import { run as runMoodEngineTests } from "./moodEngine.test.js";
import { run as runJobQueueTests } from "./jobQueue.test.js";
import { run as runVideoProcessorTests } from "./videoProcessor.test.js";

async function main() {
  const results = [
    await runMoodEngineTests(),
    await runJobQueueTests(),
    await runVideoProcessorTests(),
  ];

  const passed = results.reduce((total, result) => total + result.passed, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
