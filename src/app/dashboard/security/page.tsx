"use client";

import { useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/core/supabase";

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string };

export default function DashboardSecurityPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [factorIdEnroll, setFactorIdEnroll] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getSessionAsync().then((s) => {
      setSession(s);
      if (!s) return;
      const supabase = createBrowserClient();
      if (!supabase) return;
      supabase.auth.mfa.listFactors().then(({ data }) => {
        const all = (data?.all ?? []) as Factor[];
        setFactors(all);
        setLoading(false);
      });
    });
  }, []);

  async function startEnroll() {
    const supabase = createBrowserClient();
    if (!supabase) return;
    setError("");
    setEnrolling(true);
    setQrCode(null);
    setFactorIdEnroll(null);
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "GarmonPay",
      });
      if (err) {
        setError(err.message || "Failed to start 2FA setup");
        setEnrolling(false);
        return;
      }
      const d = data as { id: string; totp?: { qr_code: string } };
      setFactorIdEnroll(d.id);
      setQrCode(d.totp?.qr_code ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setEnrolling(false);
    }
  }

  async function verifyEnroll() {
    if (!factorIdEnroll || !verifyCode.trim()) return;
    const supabase = createBrowserClient();
    if (!supabase) return;
    setError("");
    setEnrolling(true);
    try {
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factorIdEnroll });
      if (challengeErr || !challengeData) {
        setError(challengeErr?.message || "Could not start verification");
        setEnrolling(false);
        return;
      }
      const challengeId = (challengeData as { id?: string }).id;
      if (!challengeId) {
        setError("Invalid challenge response");
        setEnrolling(false);
        return;
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: factorIdEnroll,
        challengeId,
        code: verifyCode.trim(),
      });
      if (verifyErr) {
        setError(verifyErr.message || "Invalid code");
        setEnrolling(false);
        return;
      }
      setSuccess("2FA is now enabled.");
      setQrCode(null);
      setFactorIdEnroll(null);
      setVerifyCode("");
      const { data: listData } = await supabase.auth.mfa.listFactors();
      setFactors((listData?.all ?? []) as Factor[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setEnrolling(false);
    }
  }

  const totpVerified = factors.some((f) => f.factor_type === "totp" && f.status === "verified");

  if (!session) {
    return (
      <div className="p-4 text-fintech-muted">
        Loading… If you are not redirected, <a href="/login" className="text-blue-400 underline">log in</a>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Account security</h1>

      <section className="rounded-lg border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Two-factor authentication (2FA)</h2>
        <p className="text-fintech-muted text-sm mb-4">
          Use an authenticator app (Google Authenticator, Authy, Microsoft Authenticator) for an extra layer of security.
        </p>
        {totpVerified ? (
          <p className="text-green-400 text-sm">2FA is enabled. You will be asked for a code when signing in.</p>
        ) : qrCode && factorIdEnroll ? (
          <div className="space-y-4">
            <p className="text-fintech-muted text-sm">Scan this QR code with your authenticator app, then enter the 6-digit code below.</p>
            <div className="flex justify-center">
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`} alt="QR code" className="w-48 h-48 bg-white rounded" />
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              className="w-full max-w-xs p-2 rounded text-black"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={enrolling}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={verifyEnroll}
                disabled={enrolling || verifyCode.length !== 6}
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-70"
              >
                {enrolling ? "Verifying…" : "Verify and enable"}
              </button>
              <button
                type="button"
                onClick={() => { setQrCode(null); setFactorIdEnroll(null); setVerifyCode(""); }}
                className="px-4 py-2 rounded border border-white/20 text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEnroll}
            disabled={enrolling || totpVerified}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-70"
          >
            {enrolling ? "Setting up…" : "Enable 2FA"}
          </button>
        )}
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {success && <p className="text-green-400 text-sm mt-2">{success}</p>}
      </section>
    </div>
  );
}
