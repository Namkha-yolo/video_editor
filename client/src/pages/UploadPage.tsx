import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import "./UploadPage.css";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
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

// Check the file is acceptable.
const isAcceptedVideoFile = (file: File) => {
  const name = file.name.toLowerCase(); // file name
  // compare extension name with Accepted extensions
  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((ext) =>
    name.endsWith(ext),
  );
  // check whether it is real video.
  const hasAcceptedMime =
    file.type.length === 0 || ACCEPTED_MIME_TYPES.includes(file.type);
  return hasAcceptedExtension && hasAcceptedMime;
};
const getVideoPreviewData = async (file: File): Promise<PreviewData> => {
  const previewUrl = URL.createObjectURL(file);

  try {
    // make a [video object]
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = previewUrl;

    // await to load video => resolve or reject
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Unable to load video"));
    });

    // make a [thumnail object]
    let thumbnailUrl: string | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // extract frame
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnailUrl = canvas.toDataURL("image/jpeg", 1.0);
      }
    } catch {
      thumbnailUrl = null;
    }

    return {
      thumbnailUrl,
      duration: 0,
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
  }
};

export default function UploadPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // Function for updating item
  // item parameter has been modified to a new UploadItem object
  const updateUploadItem = (
    localID: String,
    updater: (item: UploadItem) => UploadItem,
  ) => {
    // setUploads(...): change the upload array to new values
    // map: the function which make a new array looping through the original array
    setUploads((prev) =>
      prev.map((item) => (item.localId === localID ? updater(item) : item)),
    );
  };

  const uploadSingleFile = async (file: File) => {
    const localId = crypto.randomUUID();

    // initial and add new item in uplaod array
    setUploads((prev) => [
      {
        localId,
        file,
        status: "queued", // waiting
        progress: 0, // 0% in progress
        error: null, // not error
        thumbnailUrl: null, // not thumbnail
      },
      ...prev,
    ]);

    // Check some error
    // [Errors] If there is not user
    if (!user) {
      updateUploadItem(localId, (item) => ({
        // previous attribute
        ...item,
        status: "error",
        error: "Login is required.",
      }));
      return;
    }
    // [Errors] If the file is bigger than 500MB.
    if (file.size > MAX_FILE_SIZE_BYTES) {
      updateUploadItem(localId, (item) => ({
        // previous attribute
        ...item,
        status: "error",
        error: "Each file must be 500MB or less.",
      }));
      return;
    }
    // [Errors] If the file is not a video
    if (!isAcceptedVideoFile(file)) {
      updateUploadItem(localId, (item) => ({
        // previous attribute
        ...item,
        status: "error",
        error: "Only mp4, mov, webm and real video are allowed.",
      }));
      return;
    }

    // [Uploading] In progress for uploading
    updateUploadItem(localId, (item) => ({
      ...item,
      status: "uploading",
      progress: 5, // 5% in progress
      error: null,
    }));

    try {
      // Extract preview DATA
      const preview = await getVideoPreviewData(file);
      // update extracted DATA to item
      updateUploadItem(localId, (item) => ({
        ...item,
        thumbnailUrl: preview.thumbnailUrl,
        progress: 20,
      }));
    } catch (error) {}
  };

  // the function after drag and drop
  const onDrop = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      void uploadSingleFile(file);
    });
  };

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
                      src={item.thumbnailUrl}
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
