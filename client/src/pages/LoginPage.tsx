import { useState, type FormEvent } from "react";
import { Film, Github, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import "./LoginPage.css";

export default function LoginPage() {
  const [isEmailLogin, setIsEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // TODO: Google + GitHub OAuth buttons via Supabase Auth
  const [loadingProvider, setLoadingProvider] = useState<
    "google" | "github" | "email" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: "google" | "github" | "email") => {
    setErrorMessage(null);
    setLoadingProvider(provider);

    if (provider === "email") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setErrorMessage(error.message);
        setLoadingProvider(null);
        return;
      }

      return;
    } else {
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
    }
  };

  // Sign-in form Submit
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    // prevent collison with previous log
    e.preventDefault();

    // check filled out
    if (!email || !password) {
      alert("Please fill out all fields.");
      return;
    }

    await handleOAuthSignIn("email");
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
          {isEmailLogin ? (
            <form className="email-form" onSubmit={handleSubmit}>
              <p className="login-card-eyebrow">Welcome back</p>
              <h2 className="login-card-title">Login with Email </h2>

              <label>Email</label>
              <input
                type="email"
                placeholder="address@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <label>Password</label>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="login-actions">
                <p className="create-btn">Create new account</p>
                <button
                  type="submit"
                  className="login-action-button"
                  disabled={loadingProvider !== null}
                >
                  {loadingProvider === "email" ? "Connecting..." : "Log-in"}
                </button>
                <button
                  type="button"
                  className="login-action-button"
                  onClick={(e) => setIsEmailLogin(!isEmailLogin)}
                >
                  Back to select
                </button>
              </div>
            </form>
          ) : (
            <div>
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
                <button
                  type="button"
                  className="login-action-button"
                  onClick={(e) => setIsEmailLogin(!isEmailLogin)}
                  disabled={loadingProvider !== null}
                >
                  ✉️ Continue with Email
                </button>
              </div>

              <p className="login-text">
                {errorMessage ??
                  "Use Google, GitHub, or Email to sign in and continue to your dashboard."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
