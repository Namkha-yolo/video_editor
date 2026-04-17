import type { Clip } from "@clipvibe/shared";
import { formatFileSize } from "./utils";

interface ClipsPanelProps {
  clips: Clip[];
  deletingClipId: string | null;
  onDeleteClip: (clipId: string) => Promise<void>;
}

export function ClipsPanel({ clips, deletingClipId, onDeleteClip }: ClipsPanelProps) {
  if (!clips || clips.length === 0) {
    return (
      <div className="dashboard-clips-panel">
        <div className="dashboard-clips-header">
          <h2 className="dashboard-clips-title">My Clips</h2>
          <p className="dashboard-clips-subtitle">Your uploaded clips for grading</p>
        </div>
        <p className="dashboard-clips-empty">No clips uploaded yet. Go to Upload to get started.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-clips-panel">
      <div className="dashboard-clips-header">
        <h2 className="dashboard-clips-title">My Clips</h2>
        <p className="dashboard-clips-subtitle">{clips.length} clip{clips.length !== 1 ? "s" : ""} uploaded</p>
      </div>
      <ul className="dashboard-clips-list">
        {clips.map((clip) => (
          <li key={clip.id} className="dashboard-clip-item">
            <div className="dashboard-clip-main">
              <p className="dashboard-clip-name">{clip.file_name}</p>
              <p className="dashboard-clip-meta">
                {formatFileSize(clip.file_size || 0)} • Uploaded {new Date(clip.created_at).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              className="dashboard-delete-clip-btn"
              onClick={() => onDeleteClip(clip.id)}
              disabled={deletingClipId === clip.id}
              aria-label={`Delete ${clip.file_name}`}
            >
              {deletingClipId === clip.id ? "Deleting..." : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
