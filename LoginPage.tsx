import { useState } from "react";
import { supabase } from "./lib/supabase";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Must include a number.";
  if (!/[!@#$%^&*]/.test(password)) return "Must include a special character (!@#$%^&*).";
  return null;
}

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!supabase) {
      setError("System configuration error. Please contact support.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Invalid email or password. Please try again.");
    } else {
      onLogin();
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const pwError = validatePassword(password);
    if (pwError) { setError(pwError); return; }
    setLoading(true);

    const { error } = await supabase!.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email to confirm your account before logging in.");
      setMode("login");
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent. Check your inbox.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "linear-gradient(135deg, #1a365d 0%, #2d6a4f 100%)"
    }}>
      <div style={{
        background: "white", borderRadius: "16px", padding: "40px",
        width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
      }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            background: "linear-gradient(135deg, #1a365d, #2d6a4f)",
            borderRadius: "12px", width: "56px", height: "56px",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"
          }}>
            <ShieldCheck size={28} color="white" />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#1a365d", margin: "0 0 4px" }}>
            Haven Uganda
          </h1>
          <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>
            {mode === "login" ? "Sign in to your account" :
             mode === "signup" ? "Create your account" : "Reset your password"}
          </p>
        </div>

        {message && (
          <div style={{
            background: "#f0fdf4", border: "1px solid #86efac",
            borderRadius: "8px", padding: "12px", marginBottom: "20px",
            color: "#166534", fontSize: "14px"
          }}>{message}</div>
        )}

        {error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5",
            borderRadius: "8px", padding: "12px", marginBottom: "20px",
            color: "#dc2626", fontSize: "14px"
          }}>{error}</div>
        )}

        <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleReset}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "6px" }}>
              Email Address
            </label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%", padding: "10px 14px", border: "1px solid #d1d5db",
                borderRadius: "8px", fontSize: "14px", boxSizing: "border-box",
                outline: "none"
              }}
            />
          </div>

          {mode !== "reset" && (
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "6px" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"} required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8 chars, uppercase, number, symbol" : "Enter your password"}
                  style={{
                    width: "100%", padding: "10px 40px 10px 14px", border: "1px solid #d1d5db",
                    borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", outline: "none"
                  }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === "signup" && (
                <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>
                  Must be 8+ characters with uppercase, number & special character
                </p>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px", background: "linear-gradient(135deg, #1a365d, #2d6a4f)",
            color: "white", border: "none", borderRadius: "8px", fontSize: "15px",
            fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1
          }}>
            {loading ? "Please wait..." :
             mode === "login" ? "Sign In" :
             mode === "signup" ? "Create Account" : "Send Reset Email"}
          </button>
        </form>

        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "14px", color: "#6b7280" }}>
          {mode === "login" && <>
            <button onClick={() => { setMode("reset"); setError(""); setMessage(""); }}
              style={{ background: "none", border: "none", color: "#1a365d", cursor: "pointer", textDecoration: "underline" }}>
              Forgot password?
            </button>
            <span style={{ margin: "0 8px" }}>·</span>
            <button onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
              style={{ background: "none", border: "none", color: "#1a365d", cursor: "pointer", textDecoration: "underline" }}>
              Create account
            </button>
          </>}
          {mode !== "login" && (
            <button onClick={() => { setMode("login"); setError(""); setMessage(""); }}
              style={{ background: "none", border: "none", color: "#1a365d", cursor: "pointer", textDecoration: "underline" }}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}