/**
 * Quick test script to verify Claude API key works
 * and moodEngine generates proper FFmpeg filter chains.
 *
 * Run:  npx tsx test-claude.ts
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Verify the key is loaded
const key = process.env.ANTHROPIC_API_KEY;
if (!key || key === "your-anthropic-api-key") {
  console.error("❌ ANTHROPIC_API_KEY is missing or placeholder in .env");
  process.exit(1);
}
console.log(`✅ API key loaded: ${key.slice(0, 12)}...${key.slice(-4)}`);

// Import after dotenv so the key is available
const { generateGradingFilters, buildFallbackFilters } = await import(
  "./src/services/moodEngine.js"
);

// ── Test 1: Fallback filters (no Claude needed) ────────────────────────
console.log("\n── Test 1: Fallback filters (no API call) ──");
const fallback = buildFallbackFilters("cinematic");
console.log("Mood: cinematic");
console.log("Filter chain:", fallback);
console.log("✅ Fallback works\n");

// ── Test 2: Claude API call with mock clip data ────────────────────────
console.log("── Test 2: Claude API call ──");
console.log("Sending mock clip analyses to Claude...\n");

const mockClips = [
  {
    clip_id: "test-clip-001",
    brightness: 0.7,
    contrast: 0.4,
    dominant_colors: ["#F5D6A8", "#8B6914", "#FFFFFF"],
    color_temperature: 6200,
  },
  {
    clip_id: "test-clip-002",
    brightness: 0.3,
    contrast: 0.8,
    dominant_colors: ["#1A1A2E", "#16213E", "#0F3460"],
    color_temperature: 4500,
  },
];

try {
  const results = await generateGradingFilters("nostalgic", mockClips);

  console.log("✅ Claude responded successfully!\n");
  console.log("Results:");
  for (const r of results) {
    console.log(`  Clip: ${r.clip_id}`);
    console.log(`  Filters: ${r.filters}`);
    console.log();
  }

  // Validate structure
  if (!Array.isArray(results) || results.length === 0) {
    console.error("❌ Results is not a valid array");
    process.exit(1);
  }
  for (const r of results) {
    if (!r.clip_id || typeof r.filters !== "string" || !r.filters.includes("eq=")) {
      console.error("❌ Invalid result structure:", r);
      process.exit(1);
    }
  }

  console.log("✅ All validations passed — Claude integration is working!");
} catch (err) {
  console.error("❌ Claude API call failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
