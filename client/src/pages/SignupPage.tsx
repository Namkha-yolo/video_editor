import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import "./LoginPage.css";

const MIN_PASSWORD_LENGTH = 12;

export default function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isMatch, setIsMatch] = useState<boolean | null>(null);
  const [isPasswordEnough, setIsPasswordEnough] = useState<boolean | null>(null);

  const [loadingProvider, setLoadingProvider] = useState<"email" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!confirm) {
      setIsMatch(null);
      return;
    }
    setIsMatch(password === confirm);
  }, [password, confirm]);

  useEffect(() => {
    if (!password) {
      setIsPasswordEnough(null);
      return;
    }
    setIsPasswordEnough(password.length >= MIN_PASSWORD_LENGTH);
  }, [password]);

  const handleSignup = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoadingProvider("email");

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setErrorMessage(error.message);
      setLoadingProvider(null);
      return;
    }

    setSuccessMessage("Check your email to confirm your account.");
    setLoadingProvider(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || !password || !confirm) {
      setErrorMessage("Please fill out all fields.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    await handleSignup();
  };

  return (
    <div className="login-page">
      <form className="email-form" onSubmit={handleSubmit}>
        <p className="login-card-eyebrow">Welcome!</p>
        <h2 className="login-card-title">Sign up with your email</h2>

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
          minLength={MIN_PASSWORD_LENGTH}
          required
        />

        <label>Confirm Password</label>
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <div className="login-actions">
          <button
            type="submit"
            className="login-action-button"
            disabled={loadingProvider !== null || successMessage !== null}
          >
            {loadingProvider === "email" ? "Signing up..." : "Sign up"}
          </button>
          <button
            type="button"
            className="login-action-button"
            onClick={() => navigate("/login")}
          >
            Back to login
          </button>

          {isPasswordEnough === false && (
            <p
              style={{
                color: "#e74c3c",
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              Password must be at least {MIN_PASSWORD_LENGTH} characters
            </p>
          )}
          {isPasswordEnough === true && (
            <p
              style={{
                color: "#27ae60",
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              Password length is valid
            </p>
          )}
          {isMatch === false && (
            <p
              style={{
                color: "#e74c3c",
                fontSize: "0.9rem",
                marginTop: "0.3rem",
                textAlign: "center",
              }}
            >
              Passwords do not match
            </p>
          )}
          {isMatch === true && (
            <p
              style={{
                color: "#27ae60",
                fontSize: "0.9rem",
                marginTop: "0.3rem",
                textAlign: "center",
              }}
            >
              Passwords match
            </p>
          )}

          {errorMessage ? (
            <p className="login-feedback login-feedback--error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p className="login-feedback login-feedback--success" role="status">
              {successMessage}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
