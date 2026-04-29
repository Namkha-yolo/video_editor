import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useProjectStore } from "@/store/projectStore";
import api from "@/lib/api";
import type { Clip } from "@clipvibe/shared";
import "./UploadPage.css";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".webm"];
const ACCEPTED_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

interface UploadItem {
  localId: string;
  file: File;
  status: "queued" | "uploading" | "success" | "error" | "canceled";
  progress: number;
  error: string | null;
  thumbnailUrl: string | null;
  clipId?: string;
}
interface PreviewData {
  thumbnailUrl: string | null;
  duration: number;
  width: number;
  height: number;
}

// Accept only known video formats and require MIME match when available.
const isAcceptedVideoFile = (file: File) => {
  const name = file.name.toLowerCase();
  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((ext) =>
    name.endsWith(ext),
  );
  const hasAcceptedMime =
    file.type.length === 0 || ACCEPTED_MIME_TYPES.includes(file.type);
  return hasAcceptedExtension && hasAcceptedMime;
};

const getVideoPreviewData = async (file: File): Promise<PreviewData> => {
  const previewUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = previewUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to load video"));
    });

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const seekTarget = Math.min(video.duration * 0.1, 0.5);
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Failed to seek video"));
        video.currentTime = seekTarget;
      });
    }

    let thumbnailUrl: string | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
      }
    } catch {
      thumbnailUrl = null;
    }

    return {
      thumbnailUrl,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } catch {
    return {
      thumbnailUrl: null,
      duration: 0,
      width: 0,
      height: 0,
    };
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
};

export default function UploadPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { addClip, removeClip } = useProjectStore();

  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // Immutable update helper for a single upload row.
  const updateUploadItem = (
    localId: string,
    updater: (item: UploadItem) => UploadItem,
  ) => {
    setUploads((prev) =>
      prev.map((item) => (item.localId === localId ? updater(item) : item)),
    );
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const uploadSingleFile = async (file: File) => {
    const localId = crypto.randomUUID();

    // Create initial row so users see immediate feedback.
    setUploads((prev) => [
      {
        localId,
        file,
        status: "queued",
        progress: 0,
        error: null,
        thumbnailUrl: null,
      },
      ...prev,
    ]);

    // Validate user + file before talking to backend.
    if (!user) {
      updateUploadItem(localId, (item) => ({
        ...item,
        status: "error",
        error: "Login is required.",
      }));
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      updateUploadItem(localId, (item) => ({
        ...item,
        status: "error",
        error: "Each file must be 50MB or less.",
      }));
      return;
    }

    if (!isAcceptedVideoFile(file)) {
      updateUploadItem(localId, (item) => ({
        ...item,
        status: "error",
        error: "Only mp4, mov, webm and real video are allowed.",
      }));
      return;
    }

    updateUploadItem(localId, (item) => ({
      ...item,
      status: "uploading",
      progress: 5,
      error: null,
    }));

    try {
      const preview = await getVideoPreviewData(file);
      updateUploadItem(localId, (item) => ({
        ...item,
        thumbnailUrl: preview.thumbnailUrl,
        progress: 20,
      }));

      const formData = new FormData();
      formData.append("files", file);

      await sleep(50);
      updateUploadItem(localId, (item) => ({
        ...item,
        progress: 40,
      }));
      await sleep(50);

      // Backend returns uploaded clip metadata used throughout the flow.
      updateUploadItem(localId, (item) => ({
        ...item,
        progress: 50,
      }));
      const response = await api.post<{ clips: Clip[] }>(
        "/upload",
        formData,
        {},
      );

      const clip = response.data.clips[0];
      if (!clip) {
        throw new Error("Upload completed without clip data");
      }

      await sleep(100);
      updateUploadItem(localId, (item) => ({
        ...item,
        progress: 80,
      }));

      await sleep(100);
      updateUploadItem(localId, (item) => ({
        ...item,
        status: "success",
        progress: 100,
        error: null,
        clipId: clip.id,
      }));
      // Persist uploaded clip in global store for Mood page job creation.
      addClip(clip);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";

      updateUploadItem(localId, (item) => ({
        ...item,
        status: "error",
        progress: 0,
        error: message,
      }));
    }
  };

  const handleRemove = (item: UploadItem) => {
    setUploads((prev) => prev.filter((u) => u.localId !== item.localId));
    if (item.clipId) removeClip(item.clipId);
  };

  // the function after drag and drop
  const onDrop = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      void uploadSingleFile(file);
    });
  };

  const hasSuccessfulUpload = uploads.some((item) => item.status === "success");

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "video/mp4": [".mp4"],
      "video/quicktime": [".mov"],
      "video/webm": [".webm"],
    },
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <section className="upload-page">
      <div className="upload-page__header">
        <h1 className="upload-page__title">Upload your Clips</h1>
        <p className="upload-page__subtitle">
          mp4, mov, webm only. Max 50MB per clip.
        </p>
      </div>
      <div
        className={`upload-page__dropzone ${
          isDragActive ? "upload-page__dropzone--active" : ""
        }`}
        {...getRootProps()}
      >
        <input {...getInputProps()}></input>
        <p className="upload-page__dropzone-text">
          Drag and drop videos here to upload
        </p>
        <button
          className="upload-page__dropzone-button"
          type="button"
          onClick={open}
        >
          Browse and select Files
        </button>
      </div>

      <div className="upload-page__list-panel">
        <div className="upload-page__list-header">
          <h2 className="upload-page__list-title">Uploaded Clips</h2>
        </div>
        {uploads.length === 0 ? (
          <p className="upload-page__list-empty">No clips uploaded yet.</p>
        ) : (
          <div className="upload-page__items">
            {uploads.map((item) => (
              <article className="upload-page__item" key={item.localId}>
                <div className="upload-page__item-row">
                  <div className="upload-page__thumb-shell">
                    <img
                      className="upload-page__thumb-image"
                      src={item.thumbnailUrl ?? undefined}
                      alt={`${item.file.name} thumbnail`}
                    />
                  </div>
                  <div className="upload-page__item-body">
                    <div className="upload-page__item-top">
                      <div className="upload-page__item-meta">
                        <p className="upload-page__item-name">
                          {item.file.name}
                        </p>
                        <p className="upload-page__item-size">
                          {(item.file.size / (1024 * 1024)).toFixed(2)} MB •{" "}
                          {item.status}
                        </p>
                      </div>
                      <button
                        className="upload-page__item-remove"
                        type="button"
                        aria-label="Remove clip"
                        onClick={() => handleRemove(item)}
                      >
                        ✕
                      </button>
                    </div>

                    {/* check progress */}
                    <div className="upload-page__progress-track">
                      <div
                        className={`upload-page__progress-fill ${
                          item.status === "error"
                            ? "upload-page__progress-fill--error"
                            : item.status === "canceled"
                              ? "upload-page__progress-fill--canceled"
                              : item.status === "success"
                                ? "upload-page__progress-fill--success"
                                : "upload-page__progress-fill--uploading"
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="upload-page__footer">
        <p className="upload-page__footer-text">
          Upload at least one clip to continue
        </p>
        <button
          className="upload-page__next-button"
          type="button"
          disabled={!hasSuccessfulUpload}
          onClick={() => navigate("/mood")}
        >
          Next
        </button>
      </div>
    </section>
  );
}
