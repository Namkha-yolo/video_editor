import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Copy, Download, ExternalLink, Mail, Share2 } from "lucide-react";
import api from "@/lib/api";
import { formatMood } from "./dashboard/utils";
import "./SharePage.css";

interface SharedClip {
  id: string;
  file_name: string;
  duration: number | null;
  output_url: string | null;
}

interface ShareDetail {
  id: string;
  title: string | null;
  mood: string;
  allow_download: boolean;
  created_at: string;
  expires_at: string | null;
  clips: SharedClip[];
}

function shareTarget(platform: "x" | "facebook" | "linkedin" | "email", url: string, title: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  if (platform === "x") {
    return `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  }

  if (platform === "facebook") {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  }

  if (platform === "linkedin") {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
  }

  return `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<ShareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function loadShare() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<ShareDetail>(`/shares/public/${token}`);
        if (!cancelled) {
          setShare(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.error || "This share link is not available.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadShare();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = useMemo(() => {
    if (!share) return "ClipVibe export";
    return share.title || `${formatMood(share.mood)} ClipVibe export`;
  }, [share]);

  async function handleCopy() {
    await navigator.clipboard?.writeText(pageUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleNativeShare() {
    if (!navigator.share) {
      await handleCopy();
      return;
    }

    await navigator.share({
      title: shareTitle,
      text: "Check out this ClipVibe edit.",
      url: pageUrl,
    });
  }

  if (loading) {
    return (
      <main className="share-page">
        <p className="share-message">Loading shared export...</p>
      </main>
    );
  }

  if (error || !share) {
    return (
      <main className="share-page">
        <section className="share-empty">
          <h1>Share unavailable</h1>
          <p>{error || "This share link is not available."}</p>
          <Link className="share-home-link" to="/login">
            Go to ClipVibe
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="share-page">
      <header className="share-header">
        <div>
          <p className="share-kicker">ClipVibe shared export</p>
          <h1>{shareTitle}</h1>
          <p className="share-subtitle">
            {share.clips.length} graded clip{share.clips.length === 1 ? "" : "s"} in the{" "}
            {formatMood(share.mood)} mood
          </p>
        </div>
        <Link className="share-brand" to="/login">
          ClipVibe
        </Link>
      </header>

      <section className="share-actions" aria-label="Share actions">
        <button type="button" className="share-button" onClick={handleNativeShare}>
          <Share2 size={16} />
          Share
        </button>
        <button type="button" className="share-button share-button--secondary" onClick={handleCopy}>
          <Copy size={16} />
          {copied ? "Copied" : "Copy Link"}
        </button>
        <a
          className="share-button share-button--secondary"
          href={shareTarget("x", pageUrl, shareTitle)}
          target="_blank"
          rel="noreferrer"
        >
          X
        </a>
        <a
          className="share-button share-button--secondary"
          href={shareTarget("facebook", pageUrl, shareTitle)}
          target="_blank"
          rel="noreferrer"
        >
          Facebook
        </a>
        <a
          className="share-button share-button--secondary"
          href={shareTarget("linkedin", pageUrl, shareTitle)}
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn
        </a>
        <a className="share-button share-button--secondary" href={shareTarget("email", pageUrl, shareTitle)}>
          <Mail size={16} />
          Email
        </a>
      </section>

      <section className="share-clips" aria-label="Shared clips">
        {share.clips.map((clip, index) => (
          <article className="share-clip" key={clip.id}>
            <div className="share-clip-header">
              <div>
                <h2>{clip.file_name}</h2>
                <p>
                  Clip {index + 1} of {share.clips.length}
                </p>
              </div>
              {share.allow_download && clip.output_url ? (
                <a className="share-download" href={clip.output_url} download>
                  <Download size={16} />
                  Download
                </a>
              ) : null}
            </div>
            {clip.output_url ? (
              <video className="share-video" src={clip.output_url} controls preload="metadata" playsInline />
            ) : (
              <div className="share-missing">Video unavailable</div>
            )}
          </article>
        ))}
      </section>

      <footer className="share-footer">
        <Link to="/login">
          Make your own edit
          <ExternalLink size={14} />
        </Link>
      </footer>
    </main>
  );
}
