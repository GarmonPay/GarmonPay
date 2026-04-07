"use client";

import { useState } from "react";
import { getSessionAsync } from "@/lib/session";
import { certifyTaxInfoSubmitted } from "@/lib/api";

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type Props = {
  visible: boolean;
  reportableEarningsCents: number;
  thresholdCents: number;
  onCertified: () => void;
};

export function TaxInfoBanner({ visible, reportableEarningsCents, thresholdCents, onCertified }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!visible) return null;

  async function onConfirm() {
    setErr(null);
    setBusy(true);
    try {
      const session = await getSessionAsync();
      if (!session) {
        setErr("Please sign in again.");
        return;
      }
      await certifyTaxInfoSubmitted(session.accessToken ?? session.userId, !!session.accessToken);
      onCertified();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="animate-slide-up rounded-xl border border-amber-500/45 bg-amber-950/30 p-4 tablet:p-5"
      role="region"
      aria-label="Tax information required"
    >
      <h2 className="text-base font-bold text-amber-100">Tax information</h2>
      <p className="mt-2 text-sm leading-relaxed text-amber-50/90">
        Your reportable payouts from GarmonPay have reached {formatUsd(thresholdCents)} (currently{" "}
        {formatUsd(reportableEarningsCents)} cumulative). U.S. tax rules typically require us to collect
        a Form W-9 (or equivalent) before additional payouts. Submit your W-9 to support using the
        contact method in our Terms, then confirm below once it is on file.
      </p>
      {err && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onConfirm()}
        className="btn-press mt-4 min-h-touch rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Saving…" : "I have submitted my tax information (W-9) to GarmonPay"}
      </button>
    </section>
  );
}
