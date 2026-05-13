import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { moods } from "@clipvibe/shared";
import type { Mood } from "@clipvibe/shared";
import { useProjectStore } from "@/store/projectStore";
import api from "@/lib/api";
import "./MoodPage.css";

const MOOD_TOOLTIPS: Record<string, string> = {
  nostalgic: "Golden hour warmth with gentle film grain. Great for travel montages and memory reels.",
  cinematic: "Deep shadows, crushed blacks, and teal highlights. Perfect for short films and narratives.",
  hype: "Punchy saturation, sharp edges, and dynamic cuts. Ideal for sports and action clips.",
  chill: "Desaturated pastels and soft contrast. Best for vlogs, nature, and laid-back content.",
  dreamy: "Overexposed highlights and hazy glow. Works beautifully for music videos and fashion.",
  energetic: "Warm amber tones with vivid pops of color. Great for events, parties, and workouts.",
};

interface CustomMoodRuntime {
  vignette: number;
  grain: number;
  halation: number;
  person_protection: number;
}

interface CustomMoodResponse {
  lut_path: string;
  name: string;
  title: string;
  description: string;
  runtime: CustomMoodRuntime;
}

export default function MoodPage() {
  const navigate = useNavigate();
  const { clips, selectedMood, setSelectedMood } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [generateSoundtrack, setGenerateSoundtrack] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customMood, setCustomMood] = useState<CustomMoodResponse | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  const filteredMoods = moods.filter((m) =>
    m.label.toLowerCase().includes(query.toLowerCase())
  );

  async function handleGenerateCustomMood() {
    const trimmed = customPrompt.trim();
    if (!trimmed) {
      setCustomError("Describe the vibe first.");
      return;
    }
    setCustomLoading(true);
    setCustomError(null);
    try {
      const { data } = await api.post<CustomMoodResponse>("/custom-moods", { prompt: trimmed });
      setCustomMood(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const fallback =
        status === 503
          ? "Custom AI moods aren't configured on this server. Pick a preset for now."
          : status === 429
            ? "Custom mood limit reached for today. Try again tomorrow."
            : "Couldn't generate that mood. Try a different description.";
      setCustomError(err?.response?.data?.error ?? fallback);
    } finally {
      setCustomLoading(false);
    }
  }

  function handleClearCustomMood() {
    setCustomMood(null);
    setCustomError(null);
  }

  async function handleStartGrading() {
    if (!selectedMood) return;
    if (clips.length === 0) {
      setError("No clips uploaded. Go back and upload some clips first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<{ job_id: string }>("/jobs", {
        mood: selectedMood,
        clip_ids: clips.map((c) => c.id),
        generate_soundtrack: generateSoundtrack,
        custom_mood: customMood
          ? {
              lut_path: customMood.lut_path,
              name: customMood.name,
              title: customMood.title,
              description: customMood.description,
              runtime: customMood.runtime,
            }
          : undefined,
      });
      navigate(`/processing/${data.job_id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Failed to start grading. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mood-page">
      <div className="mood-page-header">
        <button className="mood-back-btn" type="button" onClick={() => navigate("/upload")}>
          ← Back
        </button>
        <h1 className="mood-page-title">Choose a Mood</h1>
        <div className="mood-clip-badge">
          {clips.length} clip{clips.length !== 1 ? "s" : ""} ready
        </div>
      </div>

      <input
        className="mood-search"
        type="text"
        placeholder="Filter moods…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mood-grid">
        {filteredMoods.map((mood) => {
          const isSelected = selectedMood === mood.value;
          return (
            <div key={mood.value} className="mood-card-wrapper">
              <motion.button
                className={`mood-card ${isSelected ? "mood-card--selected" : ""}`}
                onClick={() => setSelectedMood(mood.value as Mood)}
                animate={isSelected ? { scale: 1.04 } : { scale: 1 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <span className="mood-card-icon">{mood.icon}</span>
                <span className="mood-card-label">{mood.label}</span>
                <span className="mood-card-desc">{mood.description}</span>
              </motion.button>
              <div className="mood-tooltip">{MOOD_TOOLTIPS[mood.value]}</div>
            </div>
          );
        })}
        {filteredMoods.length === 0 && (
          <p className="mood-no-results">No moods match "{query}"</p>
        )}
      </div>

      <section className="mood-custom-panel">
        <h2 className="mood-custom-title">Or describe your own vibe</h2>
        <p className="mood-custom-hint">
          Generates a custom 3D LUT from a one-line mood description.
          Overrides the preset selected above when set.
        </p>
        <div className="mood-custom-row">
          <input
            className="mood-custom-input"
            type="text"
            placeholder='e.g. "warm sunset vacation vibe"'
            value={customPrompt}
            maxLength={500}
            onChange={(event) => setCustomPrompt(event.target.value)}
            disabled={customLoading}
          />
          <button
            type="button"
            className="mood-custom-btn"
            onClick={handleGenerateCustomMood}
            disabled={customLoading || !customPrompt.trim()}
          >
            {customLoading ? "Generating…" : "Generate"}
          </button>
        </div>
        {customError ? <p className="mood-custom-error">{customError}</p> : null}
        {customMood ? (
          <div className="mood-custom-card">
            <div>
              <strong className="mood-custom-card-title">{customMood.title}</strong>
              <p className="mood-custom-card-desc">{customMood.description}</p>
            </div>
            <button type="button" className="mood-custom-clear" onClick={handleClearCustomMood}>
              Use preset instead
            </button>
          </div>
        ) : null}
      </section>

      <label className="mood-soundtrack-toggle">
        <input
          type="checkbox"
          checked={generateSoundtrack}
          onChange={(event) => setGenerateSoundtrack(event.target.checked)}
        />
        <span className="mood-soundtrack-toggle-label">
          Generate AI soundtrack
          <span className="mood-soundtrack-toggle-hint">
            Uses Replicate text-to-music (extra cost + ~30s latency). Off = curated library.
          </span>
        </span>
      </label>

      {error && <p className="mood-page-error">{error}</p>}

      <button
        className="mood-start-btn"
        disabled={!selectedMood || loading}
        onClick={handleStartGrading}
      >
        {loading ? "Starting…" : "Start Grading"}
      </button>
    </div>
  );
}
