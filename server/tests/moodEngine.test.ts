import assert from "node:assert/strict";

import {
  buildAdaptiveFallbackFilters,
  buildFallbackFilters,
  getAllPresets,
} from "../src/services/moodEngine.js";
import { runSuite } from "./_harness.js";

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
  ]);
}
