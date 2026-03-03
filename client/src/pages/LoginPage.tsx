import { useState } from "react";
import { Film, Github, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./LoginPage.css";

export default function LoginPage() {
  // TODO: Google + GitHub OAuth buttons via Supabase Auth
  const [loadingProvider, setLoadingProvider] = useState<
    "google" | "github" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    setErrorMessage(null);
    setLoadingProvider(provider);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-bg-blob login-bg-blob-left" />
        <div className="login-bg-blob login-bg-blob-right" />
      </div>

      <div className="login-shell">
        <section className="login-hero">
          <div className="login-chip">
            <Film size={16} className="login-chip-icon" />
            AI-powered mood color grading
          </div>

          <h1 className="login-title">
            Match your video tone faster with ClipVibe
          </h1>
          <p className="login-subtitle">
            Handle upload, processing, and export in one continuous workflow.
          </p>

          <div className="login-feature-grid">
            <div className="login-feature-card">
              <p className="login-feature-label">Auto Mood Match</p>
              <p className="login-feature-text">
                Analyze each clip's emotional tone and generate a consistent
                color look
              </p>
            </div>
            <div className="login-feature-card">
              <p className="login-feature-label">Use it easily</p>
              <p className="login-feature-text">
                Just upload, processing, and delivery without unnecessary work
              </p>
            </div>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-header">
            <p className="login-card-eyebrow">Welcome back</p>
            <h2 className="login-card-title">Sign in to ClipVibe</h2>
          </div>

          <div className="login-actions">
            <button
              type="button"
              className="login-action-button"
              onClick={() => void handleOAuthSignIn("google")}
              disabled={loadingProvider !== null}
            >
              <Sparkles size={18} />
              {loadingProvider === "google"
                ? "Connecting..."
                : "Continue with Google"}
            </button>
            <button
              type="button"
              className="login-action-button"
              onClick={() => void handleOAuthSignIn("github")}
              disabled={loadingProvider !== null}
            >
              <Github size={18} />
              {loadingProvider === "github"
                ? "Connecting..."
                : "Continue with GitHub"}
            </button>
          </div>

          <p className="login-text">
            {errorMessage ??
              "Use Google or GitHub to sign in and continue to your dashboard."}
          </p>
        </section>
      </div>
    </div>
  );
}
