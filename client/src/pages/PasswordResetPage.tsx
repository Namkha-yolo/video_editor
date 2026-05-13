import {useState} from "react";
import "./LoginPage.css";

type ResetMode = "request" | "update";

export default function PasswordResetPage() {
  const [mode, setMode] = useState<ResetMode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const passwordStatus = password ? password.length >= 6 : null;
  const isMatch = confirm ? password === confirm : null;


  return (
    <div className="login-page">
      <form
        className="email-form"
      >
        
        {mode === "request" ? (
          // request page
          <>
            <p className="login-card-eyebrow">Forgot password?</p>
            <h2 className="login-card-title">Reset your password</h2>
            <label>Email</label>
            <input
              type="email"
              placeholder="address@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {/* buttons */}
            <div className="login-actions">
              {/* the request button */}
              <button
                type="submit"
                className="login-action-button"
                disabled={loading}
              >
                {loading
                  ? "Processing..."
                  : "Send reset email"
                }
              </button>
              {/* close the page */}
              <button
                type="button"
                className="login-action-button"
                onClick={() => window.close()}
              >
                Back to Login
              </button>
            </div>
          </>
        ) : (
          // reset page
          <>
            <p className="login-card-eyebrow">Create new password</p>
            <h2 className="login-card-title">Change your password</h2>
            <label>New Password</label>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <label>Confirm New Password</label>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            {/* buttons */}
            <div className="login-actions">
              {/* the request button */}
              <button
                type="submit"
                className="login-action-button"
                disabled={loading}
              >
                {loading
                  ? "Processing..."
                : "Update password"}
              </button>
              {/* close the page */}
              <button
                type="button"
                className="login-action-button"
                onClick={() => window.close()}
              >
                Back to Login
              </button>
            </div>
          </>
        )}
        
        {/* Message Section */}
        <div className="message-section">
            {/* show the message */}
            {message && (
              <p className="login-feedback" style={{color: "#27ae60"}}>
                {message}
              </p>
            )}
            {errorMessage && (
              <p className="login-feedback" style={{color: "#e74c3c"}}>
                {errorMessage}
              </p>
            )}

            {/* the password condition */}
            {passwordStatus === false && (
              <p className="login-feedback" style={{color: "#e74c3c"}}>
                Password must be at least 6 characters long
              </p>
            )}
            {/* the passwords are matched */}
            {isMatch === false && (
              <p className="login-feedback" style={{color: "#e74c3c"}}>
                Passwords do not match
              </p>
          )}
        </div>
      </form>
    </div>
  );
}
