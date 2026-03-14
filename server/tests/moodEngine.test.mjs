import assert from "node:assert/strict";

import {
  buildAdaptiveFallbackFilters,
  buildFallbackFilters,
  generateGradingFilters,
  getAllPresets,
} from "../dist/server/src/services/moodEngine.js";
import { ClaudeRateLimitError, FixedWindowRateLimiter } from "../dist/server/src/services/rateLimiters.js";
import { runSuite } from "./harness.mjs";

export async function run() {
  return runSuite("moodEngine", [
    {
      name: "mood presets expose the six roadmap moods",
      run: () => {
        assert.equal(getAllPresets().length, 6);
      },
    },
    {
      name: "baseline fallback filters keep FFmpeg syntax stable",
      run: () => {
        const filters = buildFallbackFilters("cinematic");
        assert.match(filters, /eq=brightness=/);
        assert.match(filters, /colortemperature=temperature=/);
        assert.match(filters, /vignette=PI\/[4-8]/);
        assert.match(filters, /noise=c0s=/);
      },
    },
    {
      name: "adaptive fallback filters change per clip analysis",
      run: () => {
        const brightClip = buildAdaptiveFallbackFilters("dreamy", {
          clip_id: "bright",
          brightness: 0.85,
          contrast: 0.3,
          dominant_colors: ["#ffffff"],
          color_temperature: 7200,
        });
        const darkClip = buildAdaptiveFallbackFilters("dreamy", {
          clip_id: "dark",
          brightness: 0.2,
          contrast: 0.8,
          dominant_colors: ["#111111"],
          color_temperature: 4200,
        });

        assert.notEqual(brightClip, darkClip);
        assert.match(brightClip, /colortemperature=temperature=/);
        assert.match(darkClip, /colortemperature=temperature=/);
      },
    },
    {
      name: "Claude requests are rate limited per requester",
      run: async () => {
        const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 });
        const anthropicClient = {
          messages: {
            create: async () => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify([
                    {
                      clip_id: "clip-1",
                      filters: "eq=brightness=0.05:contrast=1.1:saturation=0.9",
                    },
                  ]),
                },
              ],
            }),
          },
        };
        const reserveClaudeCapacity = (requesterId, now = Date.now()) => {
          const preview = limiter.check(requesterId, now);
          if (!preview.allowed) {
            throw new ClaudeRateLimitError("user", preview.retryAfterSeconds, preview.limit, preview.resetAt);
          }

          limiter.consume(requesterId, now);
        };

        await generateGradingFilters(
          "cinematic",
          [
            {
              clip_id: "clip-1",
              brightness: 0.6,
              contrast: 0.4,
              dominant_colors: ["#ffffff"],
              color_temperature: 6000,
            },
          ],
          {
            requesterId: "user-1",
            now: () => 1000,
            reserveClaudeCapacity,
            anthropicClient,
          }
        );

        await assert.rejects(
          () =>
            generateGradingFilters(
              "cinematic",
              [
                {
                  clip_id: "clip-1",
                  brightness: 0.6,
                  contrast: 0.4,
                  dominant_colors: ["#ffffff"],
                  color_temperature: 6000,
                },
              ],
              {
                requesterId: "user-1",
                now: () => 1000,
                reserveClaudeCapacity,
                anthropicClient,
              }
            ),
          (error) => error instanceof ClaudeRateLimitError
        );
      },
    },
  ]);
}
