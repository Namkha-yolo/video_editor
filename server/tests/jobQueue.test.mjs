import assert from "node:assert/strict";

import { createJobRunner } from "../dist/server/src/services/jobQueue.js";
import { runSuite } from "./harness.mjs";

export async function run() {
  return runSuite("jobQueue", [
    {
      name: "job runner marks a queued job as analyzing before processing",
      run: async () => {
        const updates = [];
        const progressEvents = [];

        const runJob = createJobRunner({
          processJob: async () => {
            return;
          },
          updateJobStatus: async (_jobId, status, errorMessage) => {
            updates.push({ status, error: errorMessage });
          },
          emitProgress: (payload) => {
            progressEvents.push(payload);
          },
        });

        await runJob({
          jobId: "job-1",
          mood: "cinematic",
          clipIds: ["clip-1", "clip-2"],
        });

        assert.deepEqual(updates, [{ status: "analyzing", error: undefined }]);
        assert.equal(progressEvents[0]?.status, "analyzing");
        assert.equal(progressEvents[0]?.total_clips, 2);
      },
    },
    {
      name: "job runner records failed status and emits a failure event",
      run: async () => {
        const updates = [];
        const progressEvents = [];

        const runJob = createJobRunner({
          processJob: async () => {
            throw new Error("pipeline offline");
          },
          updateJobStatus: async (_jobId, status, errorMessage) => {
            updates.push({ status, error: errorMessage });
          },
          emitProgress: (payload) => {
            progressEvents.push(payload);
          },
        });

        await assert.rejects(
          () =>
            runJob({
              jobId: "job-2",
              mood: "dreamy",
              clipIds: ["clip-1"],
            }),
          /pipeline offline/
        );

        assert.equal(updates[0]?.status, "analyzing");
        assert.equal(updates[1]?.status, "failed");
        assert.equal(updates[1]?.error, "pipeline offline");
        assert.equal(progressEvents.at(-1)?.status, "failed");
        assert.equal(progressEvents.at(-1)?.error, "pipeline offline");
      },
    },
  ]);
}
