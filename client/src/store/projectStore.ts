import { create } from "zustand";
import type { Clip, Mood, Job } from "@clipvibe/shared";

interface ProjectState {
  clips: Clip[];
  selectedMood: Mood | null;
  currentJob: Job | null;
  setClips: (clips: Clip[]) => void;
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;
  setSelectedMood: (mood: Mood | null) => void;
  setCurrentJob: (job: Job | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  clips: [],
  selectedMood: null,
  currentJob: null,
  setClips: (clips) => set({ clips }),
  addClip: (clip) => set((s) => ({ clips: [...s.clips, clip] })),
  removeClip: (id) => set((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
  setSelectedMood: (mood) => set({ selectedMood: mood }),
  setCurrentJob: (job) => set({ currentJob: job }),
}));
