"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/site-url";
import { US_STATE_OPTIONS, isStateExcludedFromParticipation } from "@/lib/us-states";
import { isAtLeastAge, maxDateOfBirthForMinimumAge } from "@/lib/signup-compliance";

/** US states available for signup (Washington excluded). */
const US_STATES = US_STATE_OPTIONS.filter((s) => s.code !== "WA");

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [state, setState] = useState("");
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
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!dateOfBirth) {
      setError("Please enter your date of birth");
      return;
    }
    if (!isAtLeastAge(dateOfBirth.trim(), 18)) {
      setError("You must be 18 or older to participate");
      return;
    }
    if (!state) {
      setError("Please select your state");
      return;
    }
    if (isStateExcludedFromParticipation(state)) {
      setError("GarmonPay is not available in Washington state");
      return;
    }

    if (!agreed) {
      setError("Please agree to the Terms of Service");
      return;
    }

    setLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedName = fullName.trim();
      const refTrim = referralCode.trim();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
          data: {
            full_name: trimmedName,
            date_of_birth: dateOfBirth.trim(),
            residence_state: state.trim().toUpperCase(),
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes("already registered")) {
          setError("An account with this email already exists. Please login.");
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
            full_name: trimmedName,
            date_of_birth: dateOfBirth.trim(),
            residence_state: state.trim().toUpperCase(),
            referralCode: refTrim || undefined,
            welcome: true,
          }),
        });
        const syncJson = (await syncRes.json().catch(() => ({}))) as { message?: string };
        if (!syncRes.ok) {
          setError(syncJson.message || "Could not finish creating your profile. Please try again or contact support.");
          return;
        }

        if (data.session) {
          router.push("/dashboard");
          router.refresh();
          return;
        }

        setSuccess(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
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
            maxWidth: 440,
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
            Account Created!
          </h2>
          <p style={{ color: "#aaa", marginBottom: 8 }}>We sent a confirmation email to:</p>
          <p style={{ color: "#fff", fontWeight: "bold", marginBottom: 24 }}>{email}</p>
          <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
            Click the link in your email to confirm your account then login.
          </p>
          <Link
            href="/login"
            style={{
              display: "block",
              padding: "14px 24px",
              background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
              color: "#fff",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: 16,
            }}
          >
            Go to Login
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
          maxWidth: 480,
          width: "100%",
          background: "rgba(13,5,32,0.9)",
          border: "1px solid rgba(124,58,237,0.4)",
          borderRadius: 20,
          padding: 40,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <h1
              style={{
                color: "#F5C842",
                fontSize: 24,
                fontWeight: "bold",
                letterSpacing: 2,
              }}
            >
              GARMONPAY
            </h1>
          </Link>
          <p style={{ color: "#888", marginTop: 8, fontSize: 14 }}>Create your free account</p>
        </div>

        {error ? (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid #EF4444",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#EF4444",
              fontSize: 14,
              marginBottom: 20,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: "#F5C842",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            FULL NAME *
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: "#F5C842",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            DATE OF BIRTH *
          </label>
          <input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            max={maxDateOfBirthForMinimumAge(18)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
          <p style={{ color: "#666", fontSize: 11, marginTop: 4 }}>Must be 18 or older to participate</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: "#F5C842",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            STATE *
          </label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "#1a0535",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: state ? "#fff" : "#666",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          >
            <option value="">Select your state</option>
            {US_STATES.map(({ code, label }) => (
              <option key={code} value={code} style={{ background: "#1a0535" }}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: "#F5C842",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            EMAIL *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: "#F5C842",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            PASSWORD *
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: "#F5C842",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            CONFIRM PASSWORD *
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.4)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              color: "#aaa",
              fontSize: 12,
              fontWeight: "bold",
              letterSpacing: 1,
              display: "block",
              marginBottom: 6,
            }}
          >
            REFERRAL CODE (optional)
          </label>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            placeholder="Enter referral code"
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,58,237,0.2)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <input
            type="checkbox"
            id="terms"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              marginTop: 2,
              cursor: "pointer",
              accentColor: "#7C3AED",
            }}
          />
          <label htmlFor="terms" style={{ color: "#aaa", fontSize: 13, lineHeight: 1.5, cursor: "pointer" }}>
            I agree to the{" "}
            <Link href="/terms" style={{ color: "#F5C842" }}>
              Terms of Service
            </Link>{" "}
            and confirm I am 18 years of age or older, and that my date of birth and state of residence are accurate.
          </label>
        </div>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading}
          style={{
            width: "100%",
            padding: "16px 24px",
            background: loading ? "#333" : "linear-gradient(135deg, #F5C842, #D4A017)",
            color: loading ? "#666" : "#0e0118",
            border: "none",
            borderRadius: 10,
            fontWeight: "bold",
            fontSize: 18,
            cursor: loading ? "not-allowed" : "pointer",
            marginBottom: 16,
          }}
        >
          {loading ? "Creating Account..." : "Create My Account"}
        </button>

        <p style={{ textAlign: "center", color: "#888", fontSize: 14 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#F5C842", fontWeight: "bold" }}>
            Login
          </Link>
        </p>

        <div
          style={{
            textAlign: "center",
            marginTop: 24,
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <p style={{ color: "#555", fontSize: 12 }}>🔒 Free to join. No credit card required.</p>
        </div>
      </div>
    </div>
  );
}
