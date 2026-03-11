import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import "./UploadPage.css";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

export default function UploadPage() {
  const navigate = useNavigate();

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

      <div className="upload-page__footer">
        <p className="upload-page__footer-text">
          Upload at least one clip to continue
        </p>
        <button
          className="upload-page__next-text"
          type="button"
          onClick={() => navigate("/bood")}
        ></button>
      </div>
    </section>
  );
}
