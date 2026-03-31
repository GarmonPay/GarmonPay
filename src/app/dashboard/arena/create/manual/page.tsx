"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { getSessionAsync } from "@/lib/session";
import {
  bodyTypeOptions,
  skinToneOptions,
  faceStyleOptions,
  hairStyleOptions,
  type BodyType,
  type SkinTone,
  type FaceStyle,
  type HairStyle,
} from "@/lib/arena-fighter-types";

const Boxer2D = dynamic(() => import("@/components/arena/Boxer2D"), { ssr: false });

const skinToneMap: Record<number, string> = {
  1: "light",
  2: "light",
  3: "medium",
  4: "tan",
  5: "dark",
  6: "deep",
};

const hairStyleMap: Record<string, string> = {
  Bald: "bald",
  "Short Fade": "fade",
  Dreads: "dreads",
  Cornrows: "cornrows",
  Afro: "afro",
  Mohawk: "mohawk",
  "Buzz Cut": "buzz",
  "Long Tied": "long",
};

const bodyTypeMap: Record<string, string> = {
  Lightweight: "lightweight",
  Middleweight: "middleweight",
  Heavyweight: "heavyweight",
};

const toneToSkinIndex: Record<SkinTone, number> = {
  tone1: 1,
  tone2: 2,
  tone3: 3,
  tone4: 4,
  tone5: 5,
  tone6: 6,
};

const styleList = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const avatarList = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];

function isHtmlResponse(str: string): boolean {
  const trimmed = str.trimStart();
  return trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<?xml");
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function PillButton({
  active,
  children,
  onClick,
  className = "",
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-[0_0_20px_rgba(240,165,0,0.25)] ring-2 ring-amber-300/60"
          : "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-amber-400/25 hover:bg-white/[0.07]",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function CreateFighterManualPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [style, setStyle] = useState<(typeof styleList)[number]>("Brawler");
  const [avatar, setAvatar] = useState(avatarList[0]);
  const [bodyType, setBodyType] = useState<BodyType>("middleweight");
  const [skinTone, setSkinTone] = useState<SkinTone>("tone3");
  const [faceStyle, setFaceStyle] = useState<FaceStyle>("determined");
  const [hairStyle, setHairStyle] = useState<HairStyle>("short_fade");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedColor, setSelectedColor] = useState("#f0a500");

  function handleRandomize() {
    setBodyType(randomChoice(bodyTypeOptions).value);
    setSkinTone(randomChoice(skinToneOptions).value);
    setFaceStyle(randomChoice(faceStyleOptions).value);
    setHairStyle(randomChoice(hairStyleOptions).value);
    setStyle(randomChoice(styleList));
    setAvatar(randomChoice(avatarList));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Fighter name must be at least 2 characters");
      return;
    }
    setLoading(true);
    try {
      const session = await getSessionAsync();
      const token = session?.accessToken;
      if (!token) {
        setError("Please log in again.");
        setLoading(false);
        return;
      }
      const apiUrl =
        typeof window !== "undefined" ? "/api/arena/fighters" : `${getApiRoot()}/arena/fighters`;
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          name: trimmed,
          style,
          avatar,
          body_type: bodyType,
          skin_tone: skinTone,
          face_style: faceStyle,
          hair_style: hairStyle,
          fighter_color: selectedColor,
        }),
      });
      const text = await res.text();
      let data: { message?: string; error?: string; errorDetail?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (!res.ok) {
          const safeMsg =
            res.status === 401
              ? "Please log in again."
              : isHtmlResponse(text)
                ? `Request failed (${res.status}). Please try again.`
                : text.slice(0, 200) || `Request failed (${res.status}).`;
          setError(safeMsg);
          setLoading(false);
          return;
        }
      }
      if (!res.ok) {
        const msg = (data.error ?? data.message) || "Failed to create fighter";
        const detail = data.errorDetail as string | undefined;
        const safeDetail = detail && !isHtmlResponse(detail) ? detail : undefined;
        setError(safeDetail ? `${msg} — ${safeDetail}` : msg);
        setLoading(false);
        return;
      }
      router.replace("/dashboard/arena");
    } catch {
      setError("Request failed");
      setLoading(false);
    }
  }

  const panelClass =
    "rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md";

  const selectedSkinTone = toneToSkinIndex[skinTone];
  const boxerSkinTone = skinToneMap[selectedSkinTone] as
    | "light"
    | "medium"
    | "tan"
    | "dark"
    | "deep";
  const hairLabel = hairStyleOptions.find((h) => h.value === hairStyle)?.label ?? "Short Fade";
  const boxerHairStyle = (hairStyleMap[hairLabel] ?? "fade") as
    | "bald"
    | "fade"
    | "dreads"
    | "cornrows"
    | "afro"
    | "mohawk"
    | "buzz"
    | "long"
    | "ponytail";
  const bodyLabel = bodyTypeOptions.find((b) => b.value === bodyType)?.label ?? "Middleweight";
  const boxerBodyType = bodyTypeMap[bodyLabel] as "lightweight" | "middleweight" | "heavyweight";
  const selectedGender = "male" as const;
  const fighterName = name.trim() || "FIGHTER";
  const selectedTrunksColor = selectedColor;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-2">
      <div className={panelClass}>
        <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Build your fighter</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400">
              Layered ring-ready look. Tune body, skin, face, and hair — preview updates live.
            </p>
          </div>
          <Link
            href="/dashboard/arena/create"
            className="shrink-0 text-sm font-semibold text-amber-400 transition hover:text-amber-300"
          >
            ← Back to choices
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_minmax(300px,400px)] lg:items-start">
          <div className="space-y-6">
            <section className={panelClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/90">Body</p>
              <p className="mt-1 text-lg font-semibold text-white">Body type</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {bodyTypeOptions.map((b) => (
                  <PillButton key={b.value} active={bodyType === b.value} onClick={() => setBodyType(b.value)}>
                    {b.label}
                  </PillButton>
                ))}
              </div>

              <p className="mt-6 text-lg font-semibold text-white">Skin tone</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {skinToneOptions.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    title={t.label}
                    onClick={() => setSkinTone(t.value)}
                    className={[
                      "h-11 w-11 rounded-full border-2 shadow-md transition-all",
                      skinTone === t.value
                        ? "scale-110 border-amber-400 ring-2 ring-amber-400/50"
                        : "border-white/15 hover:border-white/35",
                    ].join(" ")}
                    style={{ backgroundColor: t.hex }}
                  />
                ))}
              </div>
            </section>

            <section className={panelClass}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/90">Expression</p>
              <p className="mt-1 text-lg font-semibold text-white">Face</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {faceStyleOptions.map((f) => (
                  <PillButton key={f.value} active={faceStyle === f.value} onClick={() => setFaceStyle(f.value)}>
                    {f.label}
                  </PillButton>
                ))}
              </div>

              <p className="mt-6 text-lg font-semibold text-white">Hair</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {hairStyleOptions.map((h) => (
                  <PillButton key={h.value} active={hairStyle === h.value} onClick={() => setHairStyle(h.value)}>
                    {h.label}
                  </PillButton>
                ))}
              </div>

              <button
                type="button"
                onClick={handleRandomize}
                className="mt-5 w-full rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm font-semibold text-slate-200 transition hover:border-amber-400/30 hover:bg-white/[0.07]"
              >
                Randomize look
              </button>
            </section>
          </div>

          <div className="lg:sticky lg:top-6">
            <div className={panelClass + " !p-0 overflow-hidden"}>
              <div className="border-b border-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Live showcase
                </p>
                <p className="mt-0.5 text-center text-sm font-medium text-slate-300">Ring preview</p>
              </div>
              <div className="flex flex-col items-center p-3 sm:p-4">
                <Boxer2D
                  skinTone={boxerSkinTone}
                  trunksColor={selectedTrunksColor || "#F59E0B"}
                  hairStyle={boxerHairStyle}
                  bodyType={boxerBodyType}
                  gender={selectedGender || "male"}
                  name={fighterName || "FIGHTER"}
                  animate={true}
                  width={240}
                  height={360}
                />
                <p className="mt-3 text-center text-sm font-medium text-slate-400">{style}</p>
                <label className="mt-4 flex items-center justify-center gap-3 text-sm text-slate-400">
                  <span className="font-medium text-slate-300">Trunks &amp; gloves</span>
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="h-10 w-16 cursor-pointer rounded-lg border border-white/15 bg-transparent p-0.5 shadow-inner"
                    disabled={loading}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={panelClass + " mt-8 space-y-5"}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/90">Finalize</p>
          <p className="-mt-2 text-lg font-semibold text-white">Name, style &amp; icon</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-400">Fighter name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Iron Mike"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-slate-500 outline-none ring-amber-400/0 transition focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/20"
              maxLength={50}
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Style</label>
            <div className="flex flex-wrap gap-2">
              {styleList.map((s) => (
                <PillButton key={s} active={style === s} onClick={() => setStyle(s)}>
                  {s}
                </PillButton>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-400">Arena icon</label>
            <div className="flex flex-wrap gap-2">
              {avatarList.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={[
                    "flex h-12 w-12 items-center justify-center rounded-xl border text-2xl transition-all",
                    avatar === a
                      ? "border-amber-400 bg-amber-400/15 shadow-[0_0_16px_rgba(240,165,0,0.2)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20",
                  ].join(" ")}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-3.5 text-base font-bold text-black shadow-[0_4px_24px_rgba(240,165,0,0.25)] transition hover:brightness-105 disabled:opacity-60"
            >
              {loading ? "Creating…" : "Confirm fighter"}
            </button>
            <Link
              href="/dashboard/arena/create"
              className="rounded-xl border border-white/15 px-5 py-3.5 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05]"
            >
              Back
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
