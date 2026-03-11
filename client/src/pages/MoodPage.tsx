import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { moods } from "@clipvibe/shared";
import type { Mood } from "@clipvibe/shared";
import { useProjectStore } from "@/store/projectStore";
import api from "@/lib/api";
import "./MoodPage.css";

export default function MoodPage() {
  const navigate = useNavigate();
  const { clips, selectedMood, setSelectedMood } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="mood-page-title">Choose a Mood</h1>
        <p className="mood-page-subtitle">
          Select the style you want applied to your {clips.length} clip{clips.length !== 1 ? "s" : ""}.
        </p>
      </div>

      <div className="mood-grid">
        {moods.map((mood) => (
          <button
            key={mood.value}
            className={`mood-card ${selectedMood === mood.value ? "mood-card--selected" : ""}`}
            onClick={() => setSelectedMood(mood.value as Mood)}
          >
            <span className="mood-card-icon">{mood.icon}</span>
            <span className="mood-card-label">{mood.label}</span>
            <span className="mood-card-desc">{mood.description}</span>
          </button>
        ))}
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
