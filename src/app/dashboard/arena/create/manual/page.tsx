"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
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
  type FighterData,
} from "@/lib/arena-fighter-types";
import { Arena3dDynamicFallback } from "@/components/arena/arena-3d-dynamic-fallback";

const BoxerDisplay = dynamic(
  () => import("@/components/arena/BoxerDisplay"),
  {
    ssr: false,
    loading: () => <Arena3dDynamicFallback />,
  }
);

const styleList = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const avatarList = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];

function isHtmlResponse(str: string): boolean {
  const trimmed = str.trimStart();
  return trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<?xml");
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

  const previewFighter: FighterData = {
    name: name || "Fighter",
    style,
    avatar,
    body_type: bodyType,
    skin_tone: skinTone,
    face_style: faceStyle,
    hair_style: hairStyle,
    strength: 48,
    speed: 48,
    stamina: 48,
    defense: 48,
    chin: 48,
    special: 20,
  };

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
        typeof window !== "undefined"
          ? "/api/arena/fighters"
          : `${getApiRoot()}/arena/fighters`;
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

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Build your fighter</h1>
          <Link href="/dashboard/arena/create" className="text-[#f0a500] hover:underline">Back to choices</Link>
        </div>
        <p className="text-[#9ca3af] text-sm mb-6">Customize every detail, then name them and enter the Arena. Always free.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <p className="text-[#f0a500] font-medium">STEP 1 — Body type</p>
            <div className="flex flex-wrap gap-2">
              {bodyTypeOptions.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBodyType(b.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    bodyType === b.value ? "bg-[#f0a500] text-black" : "bg-[#0d1117] border border-white/10 text-white hover:bg-white/5"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <p className="text-[#f0a500] font-medium pt-2">STEP 2 — Skin tone</p>
            <div className="flex flex-wrap gap-2">
              {skinToneOptions.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSkinTone(t.value)}
                  className={`w-10 h-10 rounded-full border-2 transition ${
                    skinTone === t.value ? "border-[#f0a500] scale-110" : "border-white/20 hover:border-white/40"
                  }`}
                  style={{ backgroundColor: t.hex }}
                  title={t.label}
                />
              ))}
            </div>

            <p className="text-[#f0a500] font-medium pt-2">STEP 3 — Face</p>
            <div className="flex flex-wrap gap-2">
              {faceStyleOptions.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFaceStyle(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    faceStyle === f.value ? "bg-[#f0a500] text-black" : "bg-[#0d1117] border border-white/10 text-white hover:bg-white/5"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <p className="text-[#f0a500] font-medium pt-2">STEP 4 — Hair</p>
            <div className="flex flex-wrap gap-2">
              {hairStyleOptions.map((h) => (
                <button
                  key={h.value}
                  type="button"
                  onClick={() => setHairStyle(h.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    hairStyle === h.value ? "bg-[#f0a500] text-black" : "bg-[#0d1117] border border-white/10 text-white hover:bg-white/5"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRandomize}
              className="mt-2 px-4 py-2 rounded-lg border border-white/20 text-white text-sm font-medium hover:bg-white/5"
            >
              Randomize
            </button>
          </div>

          <div className="flex flex-col items-center justify-center bg-[#0d1117] rounded-lg border border-white/10 p-4 w-full min-w-0">
            <p className="text-[#9ca3af] text-sm mb-2">Live preview</p>
            <div className="w-full max-w-md">
              <BoxerDisplay
                fighter={{ fighter_color: selectedColor || "#f0a500" }}
                size="medium"
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-[#9ca3af]">
              Trunks color
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-white/20 bg-transparent"
                disabled={loading}
              />
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/10 pt-6">
          <p className="text-[#9ca3af] font-medium">Name, style & avatar</p>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-1">Fighter name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Iron Mike"
              className="w-full px-4 py-2.5 rounded-lg bg-[#0d1117] border border-white/10 text-white placeholder-[#6b7280]"
              maxLength={50}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Style</label>
            <div className="flex flex-wrap gap-2">
              {styleList.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    style === s ? "bg-[#f0a500] text-black" : "bg-[#0d1117] border border-white/10 text-white hover:bg-white/5"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#9ca3af] mb-2">Avatar</label>
            <div className="flex flex-wrap gap-2">
              {avatarList.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={`text-2xl w-12 h-12 rounded-lg border transition ${
                    avatar === a ? "border-[#f0a500] bg-[#f0a500]/20" : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-[#f0a500] text-black font-bold hover:bg-[#e09500] disabled:opacity-70"
            >
              {loading ? "Creating…" : "Confirm Fighter"}
            </button>
            <Link
              href="/dashboard/arena/create"
              className="px-4 py-3 rounded-lg border border-white/20 text-white font-medium hover:bg-white/5"
            >
              Back
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
