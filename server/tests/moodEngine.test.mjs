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
        assert.equal(exposure.gain_r, 1);
        assert.equal(exposure.gain_g, 1);
        assert.equal(exposure.gain_b, 1);
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
      name: "warm-cast image gets red cut and blue boosted",
      run: () => {
        const warmCast = buildExposureAdjustment("chill", {
          clip_id: "warm",
          brightness: 0.5,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 3500,
        });
        const coolCast = buildExposureAdjustment("chill", {
          clip_id: "cool",
          brightness: 0.5,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 8000,
        });

        assert.ok(warmCast.gain_r < 1);
        assert.ok(warmCast.gain_b > 1);
        assert.ok(coolCast.gain_r > 1);
        assert.ok(coolCast.gain_b < 1);
        assert.equal(warmCast.gain_g, 1);
      },
    },
    {
      name: "WB gains stay inside ±15%",
      run: () => {
        const extremeWarm = buildExposureAdjustment("hype", {
          clip_id: "x",
          brightness: 0.5,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 1500,
        });
        const extremeCool = buildExposureAdjustment("hype", {
          clip_id: "y",
          brightness: 0.5,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 12000,
        });

        for (const exposure of [extremeWarm, extremeCool]) {
          assert.ok(exposure.gain_r >= 0.85 && exposure.gain_r <= 1.15);
          assert.ok(exposure.gain_b >= 0.85 && exposure.gain_b <= 1.15);
        }
      },
    },
    {
      name: "missing color temperature falls back to identity WB",
      run: () => {
        const exposure = buildExposureAdjustment("cinematic", {
          clip_id: "no-temp",
          brightness: 0.5,
          contrast: 0.5,
          dominant_colors: [],
          color_temperature: 0,
        });
        assert.equal(exposure.gain_r, 1);
        assert.equal(exposure.gain_g, 1);
        assert.equal(exposure.gain_b, 1);
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
