"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    if (ref) setReferralCode(ref);
  }, []);

  const handleSubmit = async () => {
    setError("");

    if (!supabase) {
      setError("Registration is not configured.");
      return;
    }

    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!agreed) {
      setError("Please agree to the Terms of Service");
      return;
    }

    setLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const refTrim = referralCode.trim();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
        },
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("already registered")) {
          setError("Email already exists. Please login.");
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (data?.user) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (data.session?.access_token) {
          headers.Authorization = `Bearer ${data.session.access_token}`;
        }
        const syncRes = await fetch("/api/auth/sync-user", {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: data.user.id,
            email: data.user.email ?? trimmedEmail,
            full_name: fullName.trim(),
            referralCode: refTrim || undefined,
            welcome: true,
          }),
        });
        const syncJson = (await syncRes.json().catch(() => ({}))) as { message?: string };
        if (!syncRes.ok) {
          setError(syncJson.message || "Could not finish creating your account. Try again or contact support.");
          return;
        }

        if (data.session) {
          router.push("/dashboard?welcome_gpc=100");
          router.refresh();
          return;
        }

        setSuccess(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0e0118",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 400,
            width: "100%",
            background: "rgba(13,5,32,0.9)",
            border: "1px solid rgba(124,58,237,0.4)",
            borderRadius: 20,
            padding: 40,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2
            style={{
              color: "#F5C842",
              fontSize: 24,
              fontWeight: "bold",
              marginBottom: 12,
            }}
          >
            Welcome to GarmonPay!
          </h2>
          <p style={{ color: "#aaa", marginBottom: 8 }}>Check your email to confirm your account:</p>
          <p style={{ color: "#fff", fontWeight: "bold", marginBottom: 24, wordBreak: "break-all" }}>{email}</p>
          <p style={{ color: "#a78bfa", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
            🎉 Welcome! You received 100 GPC!
          </p>
          <p style={{ color: "#888", fontSize: 13, marginBottom: 24 }}>
            Click the confirmation link then login to start earning.
          </p>
          <Link
            href="/login"
            style={{
              display: "block",
              padding: "14px 24px",
              background: "linear-gradient(135deg, #F5C842, #D4A017)",
              color: "#0e0118",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: 16,
            }}
          >
            Go to Login →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0e0118",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "rgba(13,5,32,0.9)",
          border: "1px solid rgba(124,58,237,0.4)",
          borderRadius: 20,
          padding: 36,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <h1
              style={{
                color: "#F5C842",
                fontSize: 22,
                fontWeight: "bold",
                letterSpacing: 2,
                margin: 0,
              }}
            >
              GARMONPAY
            </h1>
          </Link>
          <p style={{ color: "#888", marginTop: 6, fontSize: 14 }}>Join free — start earning today</p>
        </div>

        {error ? (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid #EF4444",
              borderRadius: 8,
              padding: "10px 16px",
              color: "#EF4444",
              fontSize: 13,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 5 }}>FULL NAME</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 15,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 5 }}>EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 15,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 5 }}>PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 15,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 5 }}>
            REFERRAL CODE <span style={{ color: "#555" }}>(optional)</span>
          </label>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 15,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20 }}>
          <input
            type="checkbox"
            id="terms"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{
              width: 16,
              height: 16,
              marginTop: 3,
              cursor: "pointer",
              accentColor: "#7C3AED",
              flexShrink: 0,
            }}
          />
          <label htmlFor="terms" style={{ color: "#888", fontSize: 12, lineHeight: 1.5, cursor: "pointer" }}>
            I agree to the{" "}
            <Link href="/terms" style={{ color: "#F5C842" }}>
              Terms of Service
            </Link>{" "}
            and confirm I am 18+
          </label>
        </div>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading}
          style={{
            width: "100%",
            padding: "15px 24px",
            background: loading ? "#333" : "linear-gradient(135deg, #F5C842, #D4A017)",
            color: loading ? "#666" : "#0e0118",
            border: "none",
            borderRadius: 10,
            fontWeight: "bold",
            fontSize: 17,
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: 16,
          }}
        >
          {loading ? "Creating Account..." : "Create My Account 🚀"}
        </button>

        <p style={{ textAlign: "center", color: "#888", fontSize: 13, margin: 0 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#F5C842", fontWeight: "bold" }}>
            Login
          </Link>
        </p>

        <p style={{ textAlign: "center", color: "#444", fontSize: 11, marginTop: 16 }}>
          🔒 Free to join. No credit card required.
        </p>
      </div>
    </div>
  );
}
