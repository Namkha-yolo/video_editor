import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import "./LoginPage.css";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isMatch, setIsMatch] = useState<boolean | null>(null);

  const [loadingProvider, setLoadingProvider] = useState<"email" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordEnough, setIsPasswordEnough] = useState<boolean | null>(
    null,
  );

  // check between password and confirm password
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
    setIsPasswordEnough(password.length >= 6);
  }, [password]);

  const handleSignup = async () => {
    setErrorMessage(null);
    setLoadingProvider("email");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      alert(error.message);
      setLoadingProvider(null);
      return;
    } else {
      alert("A verification email has been sent. ");
    }
    window.close();
  };

  // Sign-in form Submit
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    // prevent collison with previous log
    e.preventDefault();

    // check filled out
    if (!email || !password || !confirm) {
      alert("Please fill out all fields.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirm) {
      return;
    }

    await handleSignup();
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
          minLength={6}
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
            {loadingProvider === "email" ? "Sign-up..." : "Sign-up"}
          </button>
          <button
            type="button"
            className="login-action-button"
            onClick={() => window.close()}
          >
            Back to Login
          </button>

          {/* check whether the length of password is enough */}
          {isPasswordEnough === false && (
            <p
              style={{
                color: "#e74c3c",
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              Password must be at least 6 characters long
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

          {/* check it is match between password and confirm password. */}
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
        </div>
      </form>
    </div>
  );
}
