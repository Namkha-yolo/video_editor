import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import "./UploadPage.css";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

interface UploadItem {
  localId: string;
  file: File;
  status: "queued" | "uploading" | "success" | "error" | "canceled";
  progress: number;
  error: string | null;
  thumbnailUrl: string | null;
  clipId?: string;
}

export default function UploadPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [uploads] = useState<UploadItem[]>([]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    // onDrop,
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
          mp4, mov, webm only. Max 500MB per clip.
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
                      src={item.thumbnailUrl!}
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
                          {item.file.size / (1024 * 1024)} MB • Ready
                        </p>
                      </div>
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
          onClick={() => navigate("/mood")}
        >
          Next
        </button>
      </div>
    </section>
  );
}
