export interface Clip {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  created_at: string;
}

export interface ClipAnalysis {
  clip_id: string;
  brightness: number;
  contrast: number;
  dominant_colors: string[];
  color_temperature: number;
}
