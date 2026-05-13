import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a professional film colorist. When given a mood description, you design a procedural 3D LUT recipe that captures that mood and call the create_lut_recipe tool with structured values. Be opinionated — pick values that genuinely express the requested mood, not identity values.

Guidelines for each parameter:
- name: short kebab-case identifier, e.g. "sunset-vacation" or "moody-blue"
- title: human-readable title, e.g. "Sunset Vacation"
- description: one concise sentence describing the look

LUT shape:
- curve_r, curve_g, curve_b: 5-point tone curves at x = [0, 0.25, 0.5, 0.75, 1.0]. Values 0-1, monotonically non-decreasing. Use these to lift shadows, roll highlights, or push channels. Warm looks boost red lows and cut blue highs; cool looks do the reverse.
- contrast: 0.75-1.35. 1.0 = neutral, >1 = punchier, <1 = softer.
- shadow_tint, highlight_tint: [r, g, b] arrays in -0.08 to +0.08. Positive adds that colour, negative subtracts. Classic cinematic teal-orange: shadow_tint=[-0.02, 0.01, 0.05] (teal shadows), highlight_tint=[0.06, 0.02, -0.04] (warm highlights).
- saturation: 0.5-1.6. 1.0 = neutral. Hype/Energetic moods push 1.3+; Nostalgic/Cinematic pull to 0.85-0.9.
- vibrance: 0.7-1.3. Smarter than saturation — boosts less-saturated colours more. 1.05-1.15 is typical.
- skin_strength: 0-0.8. Protects skin from saturation pushes. 0.5-0.7 for portraits.

Post-LUT runtime:
- vignette: 0-0.7. Edge darkening. Cinematic = 0.6, Hype = 0.3.
- grain: 0-20 (integer). Film grain. Nostalgic = 12, Energetic = 2.
- halation: 0-0.5. Highlight bloom. Cinematic = 0.45, Dreamy = 0.3, others typically 0.
- person_protection: 0-0.8. Mask-protect subjects from heavy looks. Hype = 0.85, Chill = 0.30, Cinematic = 0.55.

Pacing (applied during multi-clip assembly):
- speed: 0.85-1.15. Video + audio time-stretch. Hype/Energetic ≥ 1.10, Chill/Dreamy ≤ 0.95, Cinematic ≈ 1.00.
- transition: one of fade, fadeblack, fadewhite, slideleft, slideright, slideup, slidedown, wipeleft, wiperight, wipeup, wipedown, circleopen, circleclose, dissolve, smoothleft, smoothright, smoothup, smoothdown, pixelize, zoomin. Pick something that matches the energy — slow looks use long fades, punchy looks use fast slides or fadewhite.
- transition_duration: 0.2-1.5 seconds. Hype/Energetic = 0.2-0.4, Dreamy/Chill = 1.0-1.5, Cinematic = 0.7-0.9.
- audio_highpass: 0-200 Hz (0 = off). Cuts low rumble. Use 80-120 on punchy moods to tighten kicks.
- audio_lowpass: 0-15000 Hz (0 = off). Cuts treble for warmth. Use 8000-10000 on mellow moods.

Choose values that are clearly distinct from neutral. Call create_lut_recipe exactly once.`;

const RECIPE_TOOL: Anthropic.Tool = {
  name: "create_lut_recipe",
  description: "Define a procedural 3D LUT recipe matching the requested mood. Always call this tool exactly once with all required fields populated.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      curve_r: { type: "array", items: { type: "number" } },
      curve_g: { type: "array", items: { type: "number" } },
      curve_b: { type: "array", items: { type: "number" } },
      contrast: { type: "number" },
      shadow_tint: { type: "array", items: { type: "number" } },
      highlight_tint: { type: "array", items: { type: "number" } },
      saturation: { type: "number" },
      vibrance: { type: "number" },
      skin_strength: { type: "number" },
      vignette: { type: "number" },
      grain: { type: "integer" },
      halation: { type: "number" },
      person_protection: { type: "number" },
      speed: { type: "number" },
      transition: { type: "string" },
      transition_duration: { type: "number" },
      audio_highpass: { type: "integer" },
      audio_lowpass: { type: "integer" },
    },
    required: [
      "name",
      "title",
      "description",
      "curve_r",
      "curve_g",
      "curve_b",
      "contrast",
      "shadow_tint",
      "highlight_tint",
      "saturation",
      "vibrance",
      "skin_strength",
      "vignette",
      "grain",
      "halation",
      "person_protection",
      "speed",
      "transition",
      "transition_duration",
      "audio_highpass",
      "audio_lowpass",
    ],
  },
  strict: true,
};

export interface MoodRecipe {
  name: string;
  title: string;
  description: string;
  curve_r: number[];
  curve_g: number[];
  curve_b: number[];
  contrast: number;
  shadow_tint: number[];
  highlight_tint: number[];
  saturation: number;
  vibrance: number;
  skin_strength: number;
  vignette: number;
  grain: number;
  halation: number;
  person_protection: number;
  speed: number;
  transition: string;
  transition_duration: number;
  audio_highpass: number;
  audio_lowpass: number;
}

export class MoodGenerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MoodGenerationError";
  }
}

export function isAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic();
  return cachedClient;
}

export async function generateMoodRecipe(prompt: string): Promise<MoodRecipe> {
  if (!isAvailable()) {
    throw new MoodGenerationError("ANTHROPIC_API_KEY is not set");
  }
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new MoodGenerationError("prompt must be between 1 and 500 characters");
  }

  let response: Anthropic.Message;
  try {
    // Forced tool_choice and adaptive thinking are mutually exclusive in the
    // Anthropic API, so we use forced tool_choice (which guarantees a valid
    // structured recipe via strict mode) and skip thinking for this task.
    response = await getClient().messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [RECIPE_TOOL],
      tool_choice: { type: "tool", name: "create_lut_recipe" },
      messages: [
        {
          role: "user",
          content: `Generate a LUT recipe for this mood: "${trimmed}"`,
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new MoodGenerationError("Anthropic rate limit reached. Try again shortly.", err);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new MoodGenerationError("Anthropic API key is invalid.", err);
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new MoodGenerationError(`Anthropic rejected the request: ${err.message}`, err);
    }
    throw new MoodGenerationError(`Anthropic request failed: ${(err as Error).message}`, err);
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new MoodGenerationError(
      `Anthropic response did not include a tool call (stop_reason: ${response.stop_reason})`
    );
  }

  return toolUse.input as MoodRecipe;
}
