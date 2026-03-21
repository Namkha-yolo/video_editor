import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import "./LoginPage.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isMatch, setIsMatch] = useState<boolean | null>(null);

  // TODO: Google + GitHub OAuth buttons via Supabase Auth
  const [loadingProvider, setLoadingProvider] = useState<
    "google" | "github" | "email" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // check between password and confirm password
  useEffect(() => {
    if (!confirm) {
      setIsMatch(null);
      return;
    }
    setIsMatch(password === confirm);
  }, [password, confirm]);

  // Sign-in form Submit
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    // prevent collison with previous log
    e.preventDefault();

    // check filled out
    if (!email || !password || !confirm) {
      alert("Please fill out all fields.");
      return;
    }
    if (password !== confirm) {
      return;
    }

    // await handleOAuthSignIn("email");
  };

  return (
    <div className="login-page">
      <form className="email-form" onSubmit={handleSubmit}>
        <p className="login-card-eyebrow">Welcome!</p>
        <h2 className="login-card-title">Sign up with your Email </h2>

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
        <label>Confirm Password</label>
        <input
          type="password"
          placeholder="confirm Password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <div className="login-actions">
          <button
            type="submit"
            className="login-action-button"
            disabled={loadingProvider !== null}
          >
            {loadingProvider === "email" ? "Connecting..." : "Sign-up"}
          </button>
        </div>
      </form>
    </div>
  );
}
