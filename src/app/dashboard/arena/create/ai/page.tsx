"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { getSessionAsync } from "@/lib/session";

const ProBoxer = dynamic(
  () => import("@/components/arena/ProBoxer"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: 380,
          background: "#000",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 48 }}>🥊</span>
      </div>
    ),
  }
);
import type { FighterData } from "@/lib/arena-fighter-types";

const QUESTIONS: {
  id: string;
  question: string;
  options: { id: string; emoji: string; title: string; desc: string }[];
}[] = [
  {
    id: "q1",
    question: "When you step into the ring, what are you?",
    options: [
      { id: "AGGRESSOR", emoji: "🔥", title: "THE AGGRESSOR", desc: "I come forward. Always. I break them down until they quit." },
      { id: "GHOST", emoji: "👻", title: "THE GHOST", desc: "I make them miss. They can't hit what they can't see." },
      { id: "WALL", emoji: "🪨", title: "THE WALL", desc: "I take everything they got. Then I take them apart." },
      { id: "SPEEDSTER", emoji: "⚡", title: "THE SPEEDSTER", desc: "First one to strike wins. I'm already gone before they react." },
    ],
  },
  {
    id: "q2",
    question: "What is your greatest weapon?",
    options: [
      { id: "RAW_POWER", emoji: "💪", title: "RAW POWER", desc: "One clean shot. That's all I need." },
      { id: "RING_IQ", emoji: "🧠", title: "RING IQ", desc: "I think three moves ahead. I've already won before we start." },
      { id: "IRON_WILL", emoji: "🫀", title: "IRON WILL", desc: "I never stop. I outlast everyone." },
      { id: "PRECISION", emoji: "🎯", title: "PRECISION", desc: "Every punch has a purpose. No wasted energy." },
    ],
  },
  {
    id: "q3",
    question: "What drives you to fight?",
    options: [
      { id: "MONEY", emoji: "💰", title: "THE MONEY", desc: "I'm here to get paid. Simple as that." },
      { id: "GLORY", emoji: "🏆", title: "THE GLORY", desc: "I want to be the best. Nothing else matters." },
      { id: "RESPECT", emoji: "👊", title: "THE RESPECT", desc: "I want them to know my name when I walk in the room." },
      { id: "LOVE", emoji: "🩸", title: "THE LOVE", desc: "I was born for this. The ring is home." },
    ],
  },
];

const DEFAULT_PREVIEW: FighterData = {
  name: "Fighter",
  style: "Brawler",
  avatar: "🥊",
  body_type: "middleweight",
  skin_tone: "tone3",
  face_style: "determined",
  hair_style: "short_fade",
  fighter_color: "#f0a500",
  strength: 50,
  speed: 50,
  stamina: 50,
  defense: 50,
  chin: 50,
  special: 22,
};

export default function CreateFighterAIPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuto = searchParams.get("auto") === "1";

  const [step, setStep] = useState<"questions" | "loading" | "done" | "error">(isAuto ? "loading" : "questions");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [errorIsUnavailable, setErrorIsUnavailable] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (s?.email) setUsername(s.email.split("@")[0] || "Fighter");
      else if (typeof s?.userId === "string") setUsername(s.userId.slice(0, 12) || "Fighter");
    });
  }, []);

  const currentQuestion = QUESTIONS[questionIndex];
  const progress = isAuto ? 0 : (questionIndex + 1) / QUESTIONS.length;

  const runGeneration = useCallback(
    async (method: "questionnaire" | "auto", ans: string[] = []) => {
      setError("");
      const session = await getSessionAsync();
      const token = session?.accessToken ?? session?.userId;
      if (!token) {
        setError("Please log in again.");
        setStep("error");
        return;
      }
      const headers: Record<string, string> =
        session?.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
      try {
        const res = await fetch(`${getApiRoot()}/arena/fighter/ai-generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          credentials: "include",
          body: JSON.stringify({
            method,
            answers: ans,
            username: username || "Fighter",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setError(data.error || "Insufficient coins");
          setStep("error");
          return;
        }
        if (res.status === 503) {
          setError("AI generation is temporarily unavailable. You can create your fighter manually instead.");
          setErrorIsUnavailable(true);
          setStep("error");
          return;
        }
        if (!res.ok) {
          setError(data.error || "AI is warming up. Try again in a moment.");
          setStep("error");
          return;
        }
        setStep("done");
        router.replace("/dashboard/arena/create/reveal");
      } catch {
        setError("Something went wrong. Try again.");
        setStep("error");
      }
    },
    [username, router]
  );

  const handleAnswer = useCallback(
    (optionId: string) => {
      const next = [...answers, optionId];
      setAnswers(next);
      if (questionIndex + 1 >= QUESTIONS.length) {
        setStep("loading");
        runGeneration("questionnaire", next);
      } else {
        setQuestionIndex(questionIndex + 1);
      }
    },
    [answers, questionIndex, runGeneration]
  );

  useEffect(() => {
    if (isAuto && step === "loading" && username) {
      runGeneration("auto", []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuto, step, username]);

  if (step === "loading") {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-[#161b22] border border-white/10 p-8 text-center min-h-[320px] flex flex-col justify-center">
        <p className="text-white font-medium mb-2">Claude AI is forging your fighter…</p>
        <div className="inline-block w-12 h-12 border-4 border-[#f0a500] border-t-transparent rounded-full animate-spin my-4" />
        <p className="text-[#9ca3af] text-sm">One moment</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="max-w-lg mx-auto rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <div className="flex gap-3 justify-center flex-wrap">
          {!errorIsUnavailable && (
            <button
              type="button"
              onClick={() => { setStep(isAuto ? "loading" : "questions"); setError(""); setErrorIsUnavailable(false); setQuestionIndex(0); setAnswers([]); if (isAuto) runGeneration("auto", []); }}
              className="px-4 py-2 rounded-lg bg-[#f0a500] text-black font-medium"
            >
              Try again
            </button>
          )}
          {errorIsUnavailable && (
            <Link href="/dashboard/arena/create/manual" className="px-4 py-2 rounded-lg bg-[#f0a500] text-black font-medium">
              Create Manually
            </Link>
          )}
          <Link href="/dashboard/arena/create" className="px-4 py-2 rounded-lg border border-white/20 text-white">Back to choices</Link>
        </div>
      </div>
    );
  }

  if (step === "questions" && currentQuestion) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <Link href="/dashboard/arena/create" className="text-[#f0a500] hover:underline text-sm">Back</Link>
            <span className="text-[#9ca3af] text-sm">Question {questionIndex + 1} of {QUESTIONS.length}</span>
          </div>
          <div className="h-2 bg-[#0d1117] rounded-full overflow-hidden mb-8">
            <div className="h-full bg-[#f0a500] rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl font-bold text-white mb-6">{currentQuestion.question}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleAnswer(opt.id)}
                    className="text-left p-4 rounded-xl bg-[#0d1117] border border-white/10 hover:border-[#f0a500]/50 transition"
                  >
                    <span className="text-2xl block mb-2">{opt.emoji}</span>
                    <span className="font-bold text-white block">{opt.title}</span>
                    <span className="text-[#9ca3af] text-sm">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center justify-center bg-[#0d1117] rounded-lg border border-white/10 p-6 w-full min-w-0">
              <p className="text-[#9ca3af] text-sm mb-2">Preview</p>
              <div className="w-full max-w-md">
                <ProBoxer
                  fighterColor={DEFAULT_PREVIEW.fighter_color || "#f0a500"}
                  size="medium"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto rounded-xl bg-[#161b22] border border-white/10 p-8 text-center">
      <p className="text-[#9ca3af]">Redirecting…</p>
    </div>
  );
}
