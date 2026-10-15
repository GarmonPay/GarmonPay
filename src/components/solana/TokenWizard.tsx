"use client";
import { useEffect, useRef, useState } from "react";
import { artworkPrompt } from "@/lib/solana/artwork-prompt";
import { describeTradingFees, formatFeePercent } from "@/lib/solana/launch-fees";
import { validateTokenMetadata } from "@/lib/solana/token-metadata";

type Field = "name" | "symbol" | "description" | "keywords";
type Suggestion = Partial<Record<Field, string>>;
const PLAN_KEY = "garmonpay-project-plan-v1";
const fields = [
  { key: "name", label: "Token name", max: 32 },
  { key: "symbol", label: "Ticker", max: 10 },
  { key: "website", label: "Website (HTTPS)", max: 200 },
  { key: "social", label: "Social link (HTTPS)", max: 200 },
] as const;

function storedImage(value: unknown) {
  return typeof value === "string" && value.startsWith("https://") && value.includes("/storage/v1/object/public/garmonpay-token-art/") ? value : "";
}

export function TokenWizard() {
  const [form, setForm] = useState({ name: "", symbol: "", description: "", website: "", social: "", keywords: "" });
  const [concept, setConcept] = useState("");
  const [reward, setReward] = useState<"creator" | "holders">("creator");
  const [savedArt, setSavedArt] = useState("");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [suggesting, setSuggesting] = useState<Field | "all" | "">("");
  const [error, setError] = useState("");
  const [artError, setArtError] = useState("");
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState("");
  const [artNote, setArtNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [ready, setReady] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const previewUrl = useRef("");
  const prompt = artworkPrompt({ name: form.name, symbol: form.symbol, description: form.description, concept });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (raw && raw.length <= 8000) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
        setForm({
          name: text(parsed.name, 32),
          symbol: text(parsed.symbol, 10),
          description: text(parsed.description, 2000),
          website: text(parsed.website, 200),
          social: text(parsed.social, 200),
          keywords: text(parsed.keywords, 120),
        });
        setConcept(text(parsed.concept, 280));
        if (parsed.rewardDestination === "holders" || parsed.rewardDestination === "creator") setReward(parsed.rewardDestination);
        const image = storedImage(parsed.imageUrl);
        if (image) setSavedArt(image);
        if (text(parsed.name, 32) || text(parsed.concept, 280)) setSaved("Your coin draft is still on this device. Review it again before use.");
      }
    } catch { /* Invalid local drafts are ignored. */ }
    void fetch("/api/solana/launches/artwork", { credentials: "include" }).then(async response => {
      const payload = await response.json();
      const image = storedImage(payload.imageUrl);
      if (response.ok && image) {
        setSavedArt(image);
        const metadata = storedImage(payload.metadataUrl);
        if (metadata) setMetadataUrl(metadata);
        setArtNote("Saved artwork loaded. It stays available while GarmonPay storage is active. It is not an immutable archive.");
      }
    }).catch(() => undefined).finally(() => setReady(true));
    return () => { activeRequest.current?.abort(); activeRequest.current = null; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void fetch("/api/solana/launches/draft", { credentials: "include" }).then(async response => {
      if (!response.ok) return;
      const payload = await response.json();
      const draft = payload.draft;
      if (!draft || typeof draft !== "object") return;
      setForm(current => ({
        name: current.name || (typeof draft.name === "string" ? draft.name : ""),
        symbol: current.symbol || (typeof draft.symbol === "string" ? draft.symbol : ""),
        description: current.description || (typeof draft.description === "string" ? draft.description : ""),
        website: current.website || (typeof draft.website === "string" ? draft.website : ""),
        social: current.social || (typeof draft.social === "string" ? draft.social : ""),
        keywords: current.keywords || (typeof draft.keywords === "string" ? draft.keywords : ""),
      }));
      if (typeof draft.concept === "string") setConcept(current => current || draft.concept);
      if (draft.reward === "holders" || draft.reward === "creator") setReward(draft.reward);
      const image = storedImage(draft.imageUrl);
      if (image) setSavedArt(current => current || image);
    }).catch(() => undefined);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const snapshot = JSON.stringify({ ...form, concept, rewardDestination: reward, imageUrl: savedArt });
    function persist() {
      try { localStorage.setItem(PLAN_KEY, snapshot); } catch { /* The draft remains in the current page. */ }
    }
    persist();
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [ready, form, concept, reward, savedArt]);

  function edit(patch: Partial<typeof form>) {
    setReview(false); setError(""); setSaved(""); setForm(current => ({ ...current, ...patch }));
  }
  async function saveDraft() {
    if (!review) return;
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify({ ...validateTokenMetadata(form), keywords: form.keywords.slice(0, 120), concept, rewardDestination: reward, imageUrl: savedArt }));
      const account = await fetch("/api/solana/launches/draft", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, concept, reward, imageUrl: savedArt, metadataUrl }) });
      setSaved(account.ok ? "Reviewed draft saved on this device and on your wallet account. No token was created." : "Reviewed draft saved on this device. Connect a wallet to keep it on your account. No token was created.");
    } catch { setError("This browser could not save the project draft."); }
  }
  async function uploadArt(file: File | undefined) {
    if (!file || uploading) return;
    setArtError(""); setCopied(false);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setArtError("Use a PNG, JPEG, or WebP image."); return; }
    if (file.size > 1_500_000) { setArtError("Use an image under 1.5 MB."); return; }
    if (!form.name.trim() || !form.symbol.trim() || !form.description.trim()) { setArtError("Add a name, ticker, and description before uploading artwork."); return; }
    const local = URL.createObjectURL(file);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = local;
    setPreview(local);
    setUploading(true);
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("name", form.name);
      body.set("symbol", form.symbol);
      body.set("description", form.description);
      body.set("keywords", form.keywords);
      const response = await fetch("/api/solana/launches/artwork", { method: "POST", body, credentials: "include" });
      const payload = await response.json();
      const image = storedImage(payload.imageUrl);
      if (!response.ok || !image) throw new Error(payload.error || "Artwork could not be saved.");
      setSavedArt(image);
      setMetadataUrl(storedImage(payload.metadataUrl));
      setPreview("");
      URL.revokeObjectURL(local);
      if (previewUrl.current === local) previewUrl.current = "";
      setArtNote("Artwork saved on GarmonPay. The address stays available while this project’s storage is active. It is not an immutable archive.");
    } catch (cause) {
      setArtError(cause instanceof Error ? cause.message : "Artwork could not be saved. The preview is only on this page until the upload succeeds.");
    } finally { setUploading(false); }
  }
  async function removeArt() {
    setArtError("");
    const response = await fetch("/api/solana/launches/artwork", { method: "DELETE", credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setArtError(payload.error || "Artwork could not be removed."); return; }
    setSavedArt(""); setMetadataUrl(""); setPreview(""); setArtNote("Artwork removed from this draft.");
  }
  async function copyPrompt() {
    const field = document.getElementById("gp-art-prompt-text");
    if (field instanceof HTMLTextAreaElement) { field.focus(); field.select(); }
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true); setArtError("");
      return;
    } catch { /* Some browsers block the async clipboard. The selected prompt can still be copied. */ }
    try {
      if (field instanceof HTMLTextAreaElement && document.execCommand("copy")) { setCopied(true); setArtError(""); return; }
    } catch { /* The prompt remains selected. */ }
    setArtError("Copy was blocked. The prompt is selected, so use your device copy command.");
  }
  async function requestSuggestion(target: Field | "all") {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 50000);
    setSuggesting(target); setError(""); setReview(false); setOptions([]);
    try {
      const response = await fetch("/api/solana/launches/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...form, concept, fields: target === "all" ? ["name", "symbol", "description", "keywords"] : [target] }),
      });
      const payload = await response.json();
      if (activeRequest.current !== controller) return;
      const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.filter((item: unknown) => item && typeof item === "object") as Suggestion[] : payload.suggestion ? [payload.suggestion as Suggestion] : [];
      if (!response.ok || !payload.available || !suggestions.length) {
        setError(payload.reason || payload.error || "Suggestion unavailable. Type the fields yourself.");
        return;
      }
      setOptions(suggestions);
      setForm(current => ({ ...current, ...suggestions[0], website: current.website, social: current.social }));
      setNote(suggestions.length > 1 ? "Suggestions are ready. The first is in the form. Choose another or edit any field." : "Suggestion added. Edit any field.");
    } catch {
      if (activeRequest.current === controller) setError(controller.signal.aborted ? "Suggestion timed out. Type the fields yourself." : "Suggestion request failed. Type the fields yourself.");
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) { activeRequest.current = null; setSuggesting(""); }
    }
  }
  async function validate(event: React.FormEvent) {
    event.preventDefault();
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true); setError(""); setReview(false);
    try {
      const response = await fetch("/api/solana/launches/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form), signal: controller.signal });
      const payload = await response.json();
      if (activeRequest.current !== controller) return;
      if (!response.ok) throw new Error(payload.error || "Project review is unavailable. Please retry.");
      setForm(current => ({ ...validateTokenMetadata(payload.metadata), keywords: current.keywords.slice(0, 120) }));
      if (payload.launchEnabled !== false || payload.readiness?.launchEnabled !== false) throw new Error("Project review is unavailable. Please retry.");
      setReview(true);
    } catch (cause) {
      if (activeRequest.current !== controller) return;
      setError(controller.signal.aborted ? "Review interrupted or timed out. Please retry." : cause instanceof Error ? cause.message : "Validation failed");
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); }
    }
  }
  const locked = busy || suggesting !== "";
  const fees = describeTradingFees();
  const shownArt = preview || savedArt;
  return <form onSubmit={validate} className="gp-sol-form gp-sol-panel gp-coin-creator">
    <p className="gp-sol-eyebrow">PREPARE</p>
    <h2>Create a coin</h2>
    <ol className="gp-coin-steps">
      <li>Describe your coin</li>
      <li>Generate or enter the details</li>
      <li>Create artwork in your ChatGPT, then upload it</li>
      <li>Review the details and costs</li>
      <li>Launching stays closed until it is opened</li>
    </ol>
    {note ? <p className="gp-sol-muted" role="status">{note}</p> : null}
    <fieldset disabled={locked}>
      <legend className="sr-only">Token project details</legend>
      <section>
        <h3>1. Describe your coin</h3>
        <label>Coin idea
          <textarea value={concept} maxLength={280} rows={3} placeholder="A golden lion in a royal purple crown" onChange={event => { setConcept(event.target.value); setReview(false); setSaved(""); }} />
        </label>
      </section>
      <section>
        <h3>2. Token information</h3>
        <div className="gp-sol-form-grid">
          {fields.map(field => <label key={field.key}>{field.label}
            <input value={form[field.key]} maxLength={field.max} required={field.key === "name" || field.key === "symbol"} onChange={event => edit({ [field.key]: event.target.value })} />
            {(field.key === "name" || field.key === "symbol") && <button type="button" className="gp-button gp-field-regen" onClick={() => requestSuggestion(field.key)}>Regenerate {field.label.toLowerCase()}</button>}
          </label>)}
        </div>
        <label>Description
          <textarea value={form.description} required maxLength={2000} rows={4} onChange={event => edit({ description: event.target.value })} />
          <button type="button" className="gp-button gp-field-regen" onClick={() => requestSuggestion("description")}>Regenerate description</button>
        </label>
        <label>Discovery keywords
          <input value={form.keywords} maxLength={120} onChange={event => edit({ keywords: event.target.value })} />
          <button type="button" className="gp-button gp-field-regen" onClick={() => requestSuggestion("keywords")}>Regenerate keywords</button>
        </label>
        <fieldset>
          <legend>Creator rewards</legend>
          <label><input type="radio" name="reward" checked={reward === "creator"} onChange={() => setReward("creator")} /> Creator</label>
          <label><input type="radio" name="reward" checked={reward === "holders"} onChange={() => setReward("holders")} /> Holders</label>
        </fieldset>
        <p className="gp-fee-note">Holder rewards are saved with this draft only. Raydium does not pay them.</p>
      </section>
      <section>
        <h3>3. Artwork</h3>
        <button type="button" className="gp-button gp-button-gold" onClick={() => document.getElementById("gp-art-prompt")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>Generate Artwork with ChatGPT</button>
        <div id="gp-art-prompt" className="gp-art-prompt">
          <label>Image prompt
            <textarea id="gp-art-prompt-text" readOnly value={prompt} rows={5} onFocus={event => event.currentTarget.select()} />
          </label>
          <div className="gp-sol-inline-actions">
            <button type="button" className="gp-button" onClick={copyPrompt}>{copied ? "Prompt copied" : "Copy Prompt"}</button>
            <a className="gp-button gp-button-gold" href="https://chatgpt.com" target="_blank" rel="noopener noreferrer">Open ChatGPT</a>
          </div>
          <p className="gp-fee-note">Paste this prompt into ChatGPT and generate the image with your own account. Image generation depends on your ChatGPT plan and usage. Opening ChatGPT does not create the image or send it back. Return here and upload the finished picture. GarmonPay does not pay for this image.</p>
        </div>
        <div className={`gp-art-drop${uploading ? " is-busy" : ""}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadArt(event.dataTransfer.files?.[0]); }}>
          <p>{uploading ? "Saving artwork…" : "Drop a PNG, JPEG, or WebP here, or choose a file."}</p>
          <label className="gp-button">Choose image
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void uploadArt(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
        </div>
        {shownArt ? <figure className="gp-art-preview">
          <img src={shownArt} alt={form.name ? `${form.name} artwork` : "Token artwork preview"} width={240} height={240} />
          <figcaption>{savedArt && !preview ? "Saved on GarmonPay" : "Preview only — not saved yet"}</figcaption>
        </figure> : null}
        {savedArt ? <button type="button" className="gp-button" onClick={removeArt}>Remove artwork</button> : null}
        {artNote ? <p className="gp-sol-muted" role="status">{artNote}</p> : null}
        {artError ? <p role="alert" className="text-red-300">{artError}</p> : null}
      </section>
    </fieldset>
    <div className="gp-sol-inline-actions">
      <button type="button" className="gp-button" disabled={locked} onClick={() => requestSuggestion("all")}>{suggesting === "all" ? "Writing suggestions…" : "Suggest coin ideas"}</button>
      <button disabled={locked || uploading} className="gp-button gp-button-gold">{busy ? "Checking…" : "Review token"}</button>
    </div>
    {options.length > 1 && <div className="gp-sol-token-grid" role="list">{options.map((option, index) => <button type="button" className="gp-market-card" key={`${option.symbol ?? "idea"}-${index}`} onClick={() => { setForm(current => ({ ...current, ...option, website: current.website, social: current.social })); setNote("Suggestion added. Edit any field."); }}>
      <p className="gp-market-symbol">{option.symbol || "Draft"}</p>
      <h3>{option.name || "Untitled"}</h3>
      {option.description ? <p className="gp-fee-note">{option.description}</p> : null}
    </button>)}</div>}
    {saved && <p className="gp-sol-muted" role="status">{saved}</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {review && <div className="gp-sol-review gp-fee-sheet" role="status">
      <h3>4. Review · {form.name} · {form.symbol}</h3>
      {savedArt ? <img className="gp-token-art gp-token-art-large" src={savedArt} alt="" width={96} height={96} /> : <p className="gp-fee-note">No saved artwork yet.</p>}
      <p>{form.description}</p>
      <p>5. These costs would apply on a buy or sell. Launching is not open, so no transaction is created or sent. A wallet signature would be required before any future launch.</p>
      <table>
        <caption className="sr-only">Costs before confirmation</caption>
        <tbody>
          <tr><th scope="row">Platform fee</th><td>{formatFeePercent(fees.largerPlatformFee)}</td></tr>
          <tr><th scope="row">Creator fee</th><td>{formatFeePercent(fees.largerCreatorFee)}</td></tr>
          <tr><th scope="row">Protocol fee</th><td>{formatFeePercent(fees.protocolTradeFeeRate)}</td></tr>
          <tr><th scope="row">Curve total</th><td>{formatFeePercent(fees.largerAllInRate)} on a buy or sell</td></tr>
          <tr><th scope="row">Launch fee</th><td>Not charged</td></tr>
          <tr><th scope="row">Launching</th><td>Not open</td></tr>
        </tbody>
      </table>
      {metadataUrl ? <p className="gp-fee-note">Listing details are saved with the artwork.</p> : null}
      <button type="button" className="gp-button" onClick={saveDraft}>Save draft on this device</button>
    </div>}
  </form>;
}
