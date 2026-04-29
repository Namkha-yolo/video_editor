import assert from "node:assert/strict";

import {
  buildExposureAdjustment,
  buildNeutralExposure,
  getAllPresets,
} from "../dist/server/src/services/moodEngine.js";
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
      name: "neutral exposure is the identity adjustment",
      run: () => {
        const exposure = buildNeutralExposure();
        assert.equal(exposure.brightness, 0);
        assert.equal(exposure.contrast, 1);
        assert.equal(exposure.saturation, 1);
      },
    },
    {
      name: "exposure adjustment lifts dark clips and pulls down bright ones",
      run: () => {
        const dark = buildExposureAdjustment("cinematic", {
          clip_id: "dark",
          brightness: 0.2,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 4500,
        });
        const bright = buildExposureAdjustment("cinematic", {
          clip_id: "bright",
          brightness: 0.8,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 7000,
        });

        assert.ok(dark.brightness > 0, "dark clips should be lifted");
        assert.ok(bright.brightness < 0, "bright clips should be pulled down");
        assert.equal(dark.saturation, 1, "saturation is owned by the LUT");
      },
    },
    {
      name: "exposure adjustment is clamped to safe range",
      run: () => {
        const extreme = buildExposureAdjustment("hype", {
          clip_id: "x",
          brightness: 0.0,
          contrast: 0.0,
          dominant_colors: [],
          color_temperature: 5500,
        });

        assert.ok(extreme.brightness <= 0.2 && extreme.brightness >= -0.2);
        assert.ok(extreme.contrast <= 1.3 && extreme.contrast >= 0.7);
      },
    },
  ]);
}
