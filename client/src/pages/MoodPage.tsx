import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { moods } from "@clipvibe/shared";
import type { Mood } from "@clipvibe/shared";
import { useProjectStore } from "@/store/projectStore";
import api from "@/lib/api";
import "./MoodPage.css";

const MOOD_TOOLTIPS: Record<string, string> = {
  nostalgic:
    "Golden hour warmth with gentle film grain. Great for travel montages and memory reels.",
  cinematic:
    "Deep shadows, crushed blacks, and teal highlights. Perfect for short films and narratives.",
  hype: "Punchy saturation, sharp edges, and dynamic cuts. Ideal for sports and action clips.",
  chill:
    "Desaturated pastels and soft contrast. Best for vlogs, nature, and laid-back content.",
  dreamy:
    "Overexposed highlights and hazy glow. Works beautifully for music videos and fashion.",
  energetic:
    "Warm amber tones with vivid pops of color. Great for events, parties, and workouts.",
};

export default function MoodPage() {
  const navigate = useNavigate();
  const { clips, selectedMood, setSelectedMood } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const readyClips = useMemo(
    () => Array.from(new Map(clips.map((clip) => [clip.id, clip])).values()),
    [clips],
  );

  const filteredMoods = moods.filter((m) =>
    m.label.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleStartGrading() {
    if (!selectedMood) return;
    if (readyClips.length === 0) {
      setError("No clips uploaded. Go back and upload some clips first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<{ job_id: string }>("/jobs", {
        mood: selectedMood,
        clip_ids: readyClips.map((clip) => clip.id),
      });
      navigate(`/processing/${data.job_id}`);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ??
          "Failed to start grading. Please try again.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="mood-page">
      <div className="mood-page-header">
        <button
          className="mood-back-btn"
          type="button"
          onClick={() => navigate("/upload")}
        >
          ← Back
        </button>
        <h1 className="mood-page-title">Choose a Mood</h1>
        <div className="mood-clip-badge">
          {readyClips.length} clip{readyClips.length !== 1 ? "s" : ""} ready
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
                type="button"
                className={`mood-card ${isSelected ? "mood-card--selected" : ""}`}
                onClick={() =>
                  setSelectedMood(isSelected ? null : (mood.value as Mood))
                }
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
