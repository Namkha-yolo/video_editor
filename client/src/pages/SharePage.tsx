import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatMood } from "./dashboard/utils";
import "./SharePage.css";

interface ShareResponse {
  job_id: string;
  mood: string;
  clip_count: number;
  assembled_url: string;
  created_at: string;
}

function formatRelative(iso: string): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return "";
  const diffMs = Date.now() - created;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default function SharePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/share/${jobId}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${response.status})`);
        }
        const json = (await response.json()) as ShareResponse;
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Unable to load this reel.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="share-page">
      <header className="share-header">
        <Link to="/" className="share-brand">
          ClipVibe
        </Link>
      </header>

      <section className="share-body">
        {loading ? (
          <p className="share-message">Loading reel…</p>
        ) : error ? (
          <div className="share-error-card">
            <h1 className="share-title">Reel unavailable</h1>
            <p className="share-error-text">{error}</p>
            <Link to="/" className="share-cta">
              Make your own
            </Link>
          </div>
        ) : data ? (
          <article className="share-card">
            <h1 className="share-title">A {formatMood(data.mood)} reel</h1>
            <p className="share-subtitle">
              {data.clip_count} clip{data.clip_count === 1 ? "" : "s"} · created {formatRelative(data.created_at)}
            </p>
            <video
              className="share-video"
              src={data.assembled_url}
              controls
              playsInline
              preload="metadata"
            />
            <div className="share-actions">
              <button type="button" className="share-cta" onClick={handleCopyLink}>
                {copied ? "Link copied" : "Copy link"}
              </button>
              <a className="share-cta share-cta--ghost" href={data.assembled_url} download>
                Download
              </a>
              <Link to="/" className="share-cta share-cta--ghost">
                Make your own
              </Link>
            </div>
          </article>
        ) : null}
      </section>

      <footer className="share-footer">
        <span>Made with ClipVibe — choose the vibe, we handle the edit.</span>
      </footer>
    </main>
  );
}
