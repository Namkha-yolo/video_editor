import assert from "node:assert/strict";

import { processGradingJob } from "../dist/server/src/services/videoProcessor.js";
import { buildExposureAdjustment } from "../dist/server/src/services/moodEngine.js";
import { runSuite } from "./harness.mjs";

function createSupabaseMock() {
  const clipRows = [
    {
      id: "clip-1",
      user_id: "user-1",
      file_name: "first.mp4",
      storage_path: "user-1/first.mp4",
    },
    {
      id: "clip-2",
      user_id: "user-1",
      file_name: "second.mp4",
      storage_path: "user-1/second.mp4",
    },
  ];

  const updates = [];
  const uploads = [];
  const removals = [];

  const client = {
    from(table) {
      if (table === "clips") {
        return {
          select() {
            return {
              async in() {
                return { data: clipRows, error: null };
              },
            };
          },
        };
      }

      return {
        update(values) {
          return {
            async eq() {
              updates.push(values);
              return { data: null, error: null };
            },
          };
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path) {
            return {
              data: { signedUrl: `https://storage.local/${bucket}/${path}` },
              error: null,
            };
          },
          async upload(path, body) {
            uploads.push({ bucket, path, body: Buffer.from(body).toString("utf8") });
            return { error: null };
          },
          async remove(paths) {
            removals.push({ bucket, paths });
            return { data: null, error: null };
          },
        };
      },
    },
  };

  return { client, updates, uploads, removals };
}

function createFetchMock(options = {}) {
  const requests = [];

  const fetchMock = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body });

    if (url.endsWith("/analyze")) {
      if (options.failAnalyze) {
        return new Response("analysis unavailable", { status: 503 });
      }

      const brightness = body.clip_id === "clip-1" ? 0.8 : 0.25;
      const contrast = body.clip_id === "clip-1" ? 0.35 : 0.85;
      const temperature = body.clip_id === "clip-1" ? 7000 : 4200;

      return new Response(
        JSON.stringify({
          clip_id: body.clip_id,
          brightness,
          contrast,
          dominant_colors: ["#ffffff", "#222222"],
          color_temperature: temperature,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (url.endsWith("/grade")) {
      return new Response(Buffer.from(`graded:${body.mood}`), {
        status: 200,
        headers: { "Content-Type": "video/mp4" },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  return { fetchMock, requests };
}

export async function run() {
  return runSuite("videoProcessor", [
    {
      name: "processor analyzes, grades with mood + exposure, and completes",
      run: async () => {
        const { client, updates, uploads, removals } = createSupabaseMock();
        const { fetchMock, requests } = createFetchMock();
        const progressEvents = [];

        const outputPaths = await processGradingJob("job-1", "cinematic", ["clip-1", "clip-2"], {
          supabaseClient: client,
          fetchImpl: fetchMock,
          pipelineUrl: "http://pipeline.local",
          emitProgress: (payload) => {
            progressEvents.push(payload);
          },
          computeExposure: buildExposureAdjustment,
          now: () => "2026-03-09T12:00:00.000Z",
        });

        const gradeRequests = requests.filter((r) => r.url.endsWith("/grade"));
        const analyzeRequests = requests.filter((r) => r.url.endsWith("/analyze"));

        assert.deepEqual(outputPaths, [
          "user-1/job-1/clip-1-graded.mp4",
          "user-1/job-1/clip-2-graded.mp4",
        ]);
        assert.equal(analyzeRequests.length, 2);
        assert.equal(gradeRequests.length, 2);
        assert.ok(
          gradeRequests.every((r) => r.body.mood === "cinematic"),
          "every grade request carries the job's mood"
        );
        assert.ok(
          gradeRequests.every(
            (r) =>
              typeof r.body.brightness === "number" &&
              typeof r.body.contrast === "number" &&
              typeof r.body.saturation === "number"
          ),
          "every grade request carries exposure params"
        );
        // clip-1 is bright (0.8) → expect negative brightness adjustment.
        const firstClip = gradeRequests.find(
          (r) => r.url.endsWith("/grade") && r.body.signed_url.includes("first.mp4")
        );
        assert.ok(firstClip.body.brightness < 0, "bright clip pulled down");
        assert.equal(updates[0]?.status, "grading");
        assert.equal(updates[1]?.status, "complete");
        assert.equal(uploads.length, 2);
        assert.equal(removals.length, 0);
        assert.equal(progressEvents.at(-1)?.status, "complete");
      },
    },
    {
      name: "processor falls back to neutral exposure when /analyze fails",
      run: async () => {
        const { client } = createSupabaseMock();
        const { fetchMock, requests } = createFetchMock({ failAnalyze: true });
        const progressEvents = [];

        await processGradingJob("job-2", "dreamy", ["clip-1", "clip-2"], {
          supabaseClient: client,
          fetchImpl: fetchMock,
          pipelineUrl: "http://pipeline.local",
          emitProgress: (payload) => {
            progressEvents.push(payload);
          },
          computeExposure: buildExposureAdjustment,
          now: () => "2026-03-09T12:00:00.000Z",
        });

        const gradeRequests = requests.filter((r) => r.url.endsWith("/grade"));
        assert.equal(gradeRequests.length, 2);
        assert.ok(
          gradeRequests.every(
            (r) => r.body.brightness === 0 && r.body.contrast === 1 && r.body.saturation === 1
          ),
          "neutral exposure on analysis failure"
        );
        assert.ok(
          progressEvents.some((event) => event.message?.includes("neutral exposure")),
          "emits progress message about fallback"
        );
      },
    },
  ]);
}
