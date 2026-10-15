"use client";

import { FormEvent, useState } from "react";
import { COIN_CREATOR_NOTICE, artworkPrompt, coinDraft } from "@/lib/member-platform/coin-creator";

export default function CoinCreatorPage() {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const draft = coinDraft({
        name: String(form.get("name") ?? ""),
        ticker: String(form.get("ticker") ?? ""),
        description: String(form.get("description") ?? ""),
        keywords: String(form.get("keywords") ?? ""),
      });
      setPrompt(artworkPrompt(draft));
      setError("");
      setCopied(false);
    } catch (reason) {
      setPrompt("");
      setError(reason instanceof Error ? reason.message : "Check the coin details.");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">AI coin creator</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">{COIN_CREATOR_NOTICE}</p>
      </header>
      <form onSubmit={prepare} className="grid gap-3 rounded-2xl border border-white/10 bg-[#150d24] p-4 sm:p-6">
        <label className="grid gap-1 text-sm">Name<input name="name" required maxLength={32} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <label className="grid gap-1 text-sm">Ticker<input name="ticker" required maxLength={10} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <label className="grid gap-1 text-sm">Description<textarea name="description" maxLength={280} className="min-h-24 rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <label className="grid gap-1 text-sm">Keywords<input name="keywords" maxLength={120} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <button type="submit" className="w-fit rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black">Write artwork prompt</button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </form>
      {prompt && (
        <section className="rounded-2xl border border-amber-300/30 bg-[#150d24] p-4">
          <h2 className="font-semibold">Copy into your own ChatGPT</h2>
          <textarea readOnly value={prompt} className="mt-3 min-h-40 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
          <button type="button" className="mt-3 rounded-xl border border-amber-300/40 px-4 py-3 text-amber-200" onClick={() => { void navigator.clipboard.writeText(prompt); setCopied(true); }}>{copied ? "Copied" : "Copy prompt"}</button>
        </section>
      )}
    </div>
  );
}
