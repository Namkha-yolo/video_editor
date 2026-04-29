import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { moods } from "@clipvibe/shared";
import type { CustomMoodPreset, Mood, MoodGrading } from "@clipvibe/shared";
import { useProjectStore } from "@/store/projectStore";
import { toast } from "@/store/toastStore";
import api from "@/lib/api";
import "./MoodPage.css";

const CUSTOM_MOOD_STORAGE_KEY = "clipvibe.customMoods";

const DEFAULT_CUSTOM_GRADING: MoodGrading = {
  temperature: 5500,
  saturation: 1,
  contrast: 1,
  brightness: 0,
  vignette: 0.25,
  grain: 4,
};

const CUSTOM_MOOD_CONTROLS: Array<{
  key: keyof MoodGrading;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}> = [
  { key: "temperature", label: "Temperature", min: 2500, max: 9000, step: 100, suffix: "K" },
  { key: "saturation", label: "Saturation", min: 0.4, max: 2, step: 0.05 },
  { key: "contrast", label: "Contrast", min: 0.5, max: 1.8, step: 0.05 },
  { key: "brightness", label: "Brightness", min: -0.3, max: 0.3, step: 0.01 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.05 },
  { key: "grain", label: "Grain", min: 0, max: 30, step: 1 },
];

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

function loadCustomMoods(): CustomMoodPreset[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CUSTOM_MOOD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomMoods(presets: CustomMoodPreset[]) {
  window.localStorage.setItem(CUSTOM_MOOD_STORAGE_KEY, JSON.stringify(presets));
}

function formatControlValue(value: number, suffix = "") {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}${suffix}`;
}

function sanitizeCustomGrading(grading: MoodGrading): MoodGrading {
  return {
    temperature: Math.round(grading.temperature),
    saturation: Number(grading.saturation.toFixed(2)),
    contrast: Number(grading.contrast.toFixed(2)),
    brightness: Number(grading.brightness.toFixed(2)),
    vignette: Number(grading.vignette.toFixed(2)),
    grain: Math.round(grading.grain),
  };
}

export default function MoodPage() {
  const navigate = useNavigate();
  const { clips, selectedMood, setSelectedMood } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [customMoods, setCustomMoods] = useState<CustomMoodPreset[]>(loadCustomMoods);
  const [customName, setCustomName] = useState("My Custom Mood");
  const [customGrading, setCustomGrading] = useState<MoodGrading>(DEFAULT_CUSTOM_GRADING);
  const [selectedCustomMoodId, setSelectedCustomMoodId] = useState<string | null>(null);

  const readyClips = useMemo(
    () => Array.from(new Map(clips.map((clip) => [clip.id, clip])).values()),
    [clips],
  );

  const selectedCustomMood = useMemo(
    () => customMoods.find((mood) => mood.id === selectedCustomMoodId) ?? null,
    [customMoods, selectedCustomMoodId],
  );

  const filteredMoods = moods.filter((m) =>
    m.label.toLowerCase().includes(query.toLowerCase()),
  );

  const filteredCustomMoods = customMoods.filter((mood) =>
    mood.label.toLowerCase().includes(query.toLowerCase()),
  );

  const updateCustomMoods = (next: CustomMoodPreset[]) => {
    setCustomMoods(next);
    saveCustomMoods(next);
  };

  const handleSaveCustomMood = () => {
    const label = customName.trim();
    if (!label) {
      setError("Name your custom mood before saving it.");
      return;
    }

    const preset: CustomMoodPreset = {
      id: crypto.randomUUID(),
      label,
      description: "Saved custom grading preset",
      color: "#38bdf8",
      grading: sanitizeCustomGrading(customGrading),
    };

    const next = [preset, ...customMoods].slice(0, 12);
    updateCustomMoods(next);
    setSelectedMood(null);
    setSelectedCustomMoodId(preset.id);
    setError(null);
  };

  const handleSelectCustomMood = (preset: CustomMoodPreset) => {
    setSelectedMood(null);
    setSelectedCustomMoodId(preset.id);
    setCustomName(preset.label);
    setCustomGrading(preset.grading);
  };

  const handleDeleteCustomMood = (presetId: string) => {
    const next = customMoods.filter((preset) => preset.id !== presetId);
    updateCustomMoods(next);
    if (selectedCustomMoodId === presetId) {
      setSelectedCustomMoodId(null);
    }
  };

  async function handleStartGrading() {
    if (!selectedMood && !selectedCustomMood) return;
    if (readyClips.length === 0) {
      setError("No clips uploaded. Go back and upload some clips first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = selectedCustomMood
        ? {
            custom_mood: selectedCustomMood,
            clip_ids: readyClips.map((clip) => clip.id),
          }
        : {
            mood: selectedMood,
            clip_ids: readyClips.map((clip) => clip.id),
          };

      const { data } = await api.post<{ job_id: string }>("/jobs", payload);
      navigate(`/processing/${data.job_id}`);
    } catch (err: any) {
      const message = err?.response?.data?.error ?? "Failed to start grading. Please try again.";
      setError(message);
      toast.error(message);
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
          Back
        </button>
        <h1 className="mood-page-title">Choose a Mood</h1>
        <div className="mood-clip-badge">
          {readyClips.length} clip{readyClips.length !== 1 ? "s" : ""} ready
        </div>
      </div>

      <input
        className="mood-search"
        type="text"
        placeholder="Filter moods"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mood-grid">
        {filteredMoods.map((mood) => {
          const isSelected = selectedMood === mood.value && !selectedCustomMood;
          return (
            <div key={mood.value} className="mood-card-wrapper">
              <motion.button
                type="button"
                className={`mood-card ${isSelected ? "mood-card--selected" : ""}`}
                onClick={() => {
                  setSelectedCustomMoodId(null);
                  setSelectedMood(isSelected ? null : (mood.value as Mood));
                }}
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
        {filteredMoods.length === 0 && filteredCustomMoods.length === 0 && (
          <p className="mood-no-results">No moods match "{query}"</p>
        )}
      </div>

      <section className="custom-mood-panel">
        <div className="custom-mood-panel__header">
          <div>
            <h2 className="custom-mood-panel__title">Custom Mood Builder</h2>
            <p className="custom-mood-panel__subtitle">
              Tune a reusable grading preset with the same controls used by the renderer.
            </p>
          </div>
          <button
            className="custom-mood-panel__save"
            type="button"
            onClick={handleSaveCustomMood}
          >
            Save Preset
          </button>
        </div>

        <label className="custom-mood-name">
          <span>Name</span>
          <input
            type="text"
            value={customName}
            maxLength={48}
            onChange={(event) => setCustomName(event.target.value)}
          />
        </label>

        <div className="custom-mood-controls">
          {CUSTOM_MOOD_CONTROLS.map((control) => (
            <label className="custom-mood-control" key={control.key}>
              <span className="custom-mood-control__top">
                <span>{control.label}</span>
                <strong>
                  {formatControlValue(customGrading[control.key], control.suffix)}
                </strong>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={customGrading[control.key]}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setCustomGrading((current) => ({
                    ...current,
                    [control.key]: value,
                  }));
                }}
              />
            </label>
          ))}
        </div>

        {filteredCustomMoods.length > 0 && (
          <div className="custom-mood-saved">
            <h3 className="custom-mood-saved__title">Saved Custom Presets</h3>
            <div className="custom-mood-saved__grid">
              {filteredCustomMoods.map((preset) => {
                const isSelected = selectedCustomMoodId === preset.id;
                return (
                  <article
                    className={`custom-mood-card ${isSelected ? "custom-mood-card--selected" : ""}`}
                    key={preset.id}
                  >
                    <button
                      className="custom-mood-card__select"
                      type="button"
                      onClick={() => handleSelectCustomMood(preset)}
                    >
                      <span className="custom-mood-card__name">{preset.label}</span>
                      <span className="custom-mood-card__meta">
                        {preset.grading.temperature}K / sat {preset.grading.saturation}
                      </span>
                    </button>
                    <button
                      className="custom-mood-card__delete"
                      type="button"
                      onClick={() => handleDeleteCustomMood(preset.id)}
                      aria-label={`Delete ${preset.label}`}
                    >
                      Delete
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {error && <p className="mood-page-error">{error}</p>}

      <button
        className="mood-start-btn"
        disabled={(!selectedMood && !selectedCustomMood) || loading}
        onClick={handleStartGrading}
      >
        {loading ? "Starting..." : "Start Grading"}
      </button>
    </div>
  );
}
