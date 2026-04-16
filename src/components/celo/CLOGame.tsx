"use client";

import { useState, useEffect } from "react";
import VoiceChat from "@/components/celo/VoiceChat";
import { localeInt } from "@/lib/format-number";

export type CLOGameProps = {
  /** When set, shows VoiceChat below the voice bar (same column as the preview table). */
  roomId?: string;
};

type Speaker = { uid: string; name: string };

// ─── Voice Bar (stubbed for preview — Agora wired in real project) ────────
function VoiceBar({ maxWidth = 440 }: { maxWidth?: number }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  const join = () => {
    setSpeakers([{ uid: "you", name: "You" }]);
    setJoined(true);
  };
  const leave = () => {
    setJoined(false);
    setSpeakers([]);
    setMuted(false);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth,
        background: "#0a001a",
        borderRadius: 14,
        border: `1px solid ${joined ? "#7c3aed50" : "#7c3aed20"}`,
        padding: "10px 14px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "border 0.3s",
      }}
    >
      <span style={{ fontSize: 14 }}>🎤</span>
      <span
        style={{
          fontSize: 9,
          color: "#ffffff40",
          fontFamily: "'DM Mono',monospace",
          letterSpacing: "0.2em",
          flexShrink: 0,
        }}
      >
        VOICE
      </span>
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 6,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {joined ? (
          speakers.map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: "#a78bfa",
                fontFamily: "'DM Mono',monospace",
                background: "#7c3aed18",
                borderRadius: 20,
                padding: "2px 8px",
                border: "1px solid #7c3aed30",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {muted ? "🔇" : "🎤"} {s.name}
            </div>
          ))
        ) : (
          <span style={{ fontSize: 10, color: "#ffffff20", fontFamily: "'DM Mono',monospace" }}>
            No one in voice
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {joined && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              border: "none",
              background: muted ? "#ef444420" : "#7c3aed30",
              color: muted ? "#ef4444" : "#a78bfa",
              fontSize: 11,
              fontFamily: "'DM Mono',monospace",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {muted ? "UNMUTE" : "MUTE"}
          </button>
        )}
        <button
          type="button"
          onClick={joined ? leave : join}
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            border: "none",
            background: joined ? "#ef444420" : "linear-gradient(135deg,#7c3aed,#9333ea)",
            color: joined ? "#ef4444" : "#fff",
            fontSize: 11,
            fontFamily: "'DM Mono',monospace",
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.05em",
            transition: "all 0.2s",
          }}
        >
          {joined ? "LEAVE" : "JOIN"}
        </button>
      </div>
    </div>
  );
}

// ─── Dice faces & data ────────────────────────────────────────────────────
const DOTS = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 20],
    [72, 20],
    [28, 50],
    [72, 50],
    [28, 80],
    [72, 80],
  ],
};

const FACE_X_ROT = { 1: 0, 6: 180, 2: -90, 5: 90, 3: 0, 4: 0 };
const FACE_Y_ROT = { 1: 0, 6: 0, 2: 0, 5: 0, 3: -90, 4: 90 };

const HYPE = [
  "🔥 BigBank rolled 4-5-6 • BANKED",
  "💀 Xero got DICE! Lost it all",
  "👑 FlexGod hit TRIPS • 4-4-4",
  "🎲 SmokeCity bet 500 • IN",
  "💸 TrapKing just doubled up",
  "😤 Ghost rolled 1-2-3 • INSTANT W",
  "🤑 PaperChase cashed 1,200 $GPAY",
  "🔥 Ace hit 6-6-6 • HOUSE MONEY",
  "👀 NewPlayer joined the room",
  "💥 Dez lost 800 on a DICE",
  "🏆 YungBank on a 5-roll streak",
  "🎯 Lucky7 placed MAX bet",
];

const PLAYERS = [
  { name: "BigBank", emoji: "👑", color: "#f5c842", bet: 500 },
  { name: "FlexGod", emoji: "💎", color: "#a78bfa", bet: 250 },
  { name: "TrapKing", emoji: "🔥", color: "#ef4444", bet: 750 },
  { name: "Ghost", emoji: "👻", color: "#06b6d4", bet: 100 },
  { name: "PaperChase", emoji: "💸", color: "#10b981", bet: 1000 },
  { name: "Xero", emoji: "⚡", color: "#f97316", bet: 300 },
];

type OutcomeDef = {
  label: string;
  sub: string;
  color: string;
  type: "win" | "loss" | "point";
};

const OUTCOMES: OutcomeDef[] = [
  { label: "4-5-6", sub: "AUTOMATIC WIN", color: "#f5c842", type: "win" },
  { label: "1-2-3", sub: "AUTOMATIC WIN", color: "#10b981", type: "win" },
  { label: "TRIPS!", sub: "THREE OF A KIND", color: "#a78bfa", type: "win" },
  { label: "POINT", sub: "YOUR NUMBER IS SET", color: "#06b6d4", type: "point" },
  { label: "DICE!", sub: "AUTO LOSS", color: "#ef4444", type: "loss" },
];

function resolveOutcome(d: number[]): OutcomeDef {
  const [a, b, c] = [...d].sort((x, y) => x - y);
  if (a === 4 && b === 5 && c === 6) return OUTCOMES[0];
  if (a === 1 && b === 2 && c === 3) return OUTCOMES[1];
  if (a === b && b === c) return OUTCOMES[2];
  if (a === b || b === c) return OUTCOMES[3];
  return OUTCOMES[4];
}

function DiceFace({ value, transform }: { value: keyof typeof DOTS; transform: string }) {
  const dots = DOTS[value];
  return (
    <div
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        transform,
        backfaceVisibility: "hidden",
        borderRadius: 14,
        background: "radial-gradient(145deg at 28% 22%,#202020 0%,#080808 75%)",
        border: "2.5px solid #b8860b",
        boxShadow: "inset 0 1px 0 #f5c84230, inset 0 -1px 0 #00000060",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 5,
          borderRadius: 10,
          border: "1px solid #f5c84220",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "radial-gradient(circle,#f5c84222 0%,transparent 70%)",
        }}
      />
      {dots.map(([x, y], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            transform: "translate(-50%,-50%)",
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 30%,#fff8dc,#d4a017)",
            boxShadow: "0 0 4px #b8860b90",
          }}
        />
      ))}
    </div>
  );
}

function Die({
  rollState,
  finalValue,
  delay,
  idx,
}: {
  rollState: string;
  finalValue: number;
  delay: number;
  idx: number;
}) {
  const size = 76;
  const half = size / 2;
  const faces = [
    { value: 1, transform: `rotateY(0deg)   translateZ(${half}px)` },
    { value: 6, transform: `rotateY(180deg) translateZ(${half}px)` },
    { value: 2, transform: `rotateX(90deg)  translateZ(${half}px)` },
    { value: 5, transform: `rotateX(-90deg) translateZ(${half}px)` },
    { value: 3, transform: `rotateY(-90deg) translateZ(${half}px)` },
    { value: 4, transform: `rotateY(90deg)  translateZ(${half}px)` },
  ];

  let cubeRotation = "rotateX(0deg) rotateY(0deg)";
  let transition = "none";
  let animation = "none";

  if (rollState === "rolling") {
    animation = `dieRoll${idx} 0.6s ease-in-out infinite`;
  } else if (rollState === "settling") {
    const rx = FACE_X_ROT[finalValue as keyof typeof FACE_X_ROT];
    const ry = FACE_Y_ROT[finalValue as keyof typeof FACE_Y_ROT];
    const extraX = (3 + idx) * 360;
    const extraY = (2 + idx) * 360;
    cubeRotation = `rotateX(${rx + extraX}deg) rotateY(${ry + extraY}deg)`;
    transition = `transform ${1.4 + idx * 0.15}s cubic-bezier(0.22,1,0.36,1) ${delay}ms`;
  } else if (rollState === "done") {
    const rx = FACE_X_ROT[finalValue as keyof typeof FACE_X_ROT];
    const ry = FACE_Y_ROT[finalValue as keyof typeof FACE_Y_ROT];
    const extraX = (3 + idx) * 360;
    const extraY = (2 + idx) * 360;
    cubeRotation = `rotateX(${rx + extraX}deg) rotateY(${ry + extraY}deg)`;
    transition = "none";
  }

  return (
    <div style={{ width: size, height: size, perspective: 400, flexShrink: 0 }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: cubeRotation,
          transition,
          animation,
        }}
      >
        {faces.map((f, i) => (
          <DiceFace key={i} value={f.value as keyof typeof DOTS} transform={f.transform} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────
export default function CLOGame({ roomId }: CLOGameProps) {
  const [finalDice, setFinalDice] = useState([1, 2, 3]);
  const [rollState, setRollState] = useState("idle");
  const [outcome, setOutcome] = useState<OutcomeDef | null>(null);
  const [phase, setPhase] = useState("idle");
  const [bank, setBank] = useState(11350);
  const [bet, setBet] = useState(100);
  const [round, setRound] = useState(1);
  const [streak, setStreak] = useState(0);
  const [feed, setFeed] = useState(HYPE.slice(0, 5));
  const [activeP, setActiveP] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setFeed((p) => [...p.slice(-7), HYPE[Math.floor(Math.random() * HYPE.length)]]);
      setActiveP(Math.floor(Math.random() * PLAYERS.length));
    }, 2400);
    return () => clearInterval(iv);
  }, []);

  const handleRoll = () => {
    if (rollState !== "idle" && rollState !== "done") return;
    if (phase === "result") return;
    const final = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
    setFinalDice(final);
    setOutcome(null);
    setPhase("rolling");
    setRollState("rolling");
    setTimeout(() => setRollState("settling"), 1800);
    setTimeout(() => {
      setRollState("done");
      setPhase("result");
      const result = resolveOutcome(final);
      setOutcome(result);
      setRound((r) => r + 1);
      if (result.type === "win") {
        setBank((b) => b + bet);
        setStreak((s) => s + 1);
      }
      if (result.type === "loss") {
        setBank((b) => b - bet);
        setStreak(0);
      }
      setFeed((p) => [
        ...p.slice(-7),
        result.type === "win"
          ? `🔥 YOU hit ${result.label} • +${bet} $GPAY`
          : result.type === "loss"
            ? `💀 YOU rolled DICE! • -${bet} $GPAY`
            : `🎯 YOU set your point`,
      ]);
    }, 3400);
  };

  const oc = outcome?.color ?? "#7c3aed";
  const isRolling = rollState === "rolling" || rollState === "settling";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#06000f",
        fontFamily: "'DM Sans',sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 16px 40px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;900&family=DM+Mono:wght@500&family=Bebas+Neue&display=swap'); @keyframes dieRoll0{0%{transform:rotateX(0deg) rotateY(0deg)}25%{transform:rotateX(180deg) rotateY(90deg)}50%{transform:rotateX(360deg) rotateY(180deg)}75%{transform:rotateX(540deg) rotateY(270deg)}100%{transform:rotateX(720deg) rotateY(360deg)}} @keyframes dieRoll1{0%{transform:rotateX(0deg) rotateY(45deg)}25%{transform:rotateX(90deg) rotateY(180deg)}50%{transform:rotateX(270deg) rotateY(270deg)}75%{transform:rotateX(450deg) rotateY(360deg)}100%{transform:rotateX(720deg) rotateY(450deg)}} @keyframes dieRoll2{0%{transform:rotateX(45deg) rotateY(0deg)}25%{transform:rotateX(225deg) rotateY(135deg)}50%{transform:rotateX(405deg) rotateY(225deg)}75%{transform:rotateX(585deg) rotateY(315deg)}100%{transform:rotateX(720deg) rotateY(360deg)}} @keyframes popIn{0%{transform:scale(0.4);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}} @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}} @keyframes glow{0%,100%{box-shadow:0 0 20px #7c3aed40}50%{box-shadow:0 0 50px #7c3aed90,0 0 100px #7c3aed20}} ::-webkit-scrollbar{display:none}`}</style>

      {/* Ambient glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 70% 50% at 50% 90%,${oc}18 0%,transparent 70%)`,
          transition: "background 0.8s ease",
        }}
      />

      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: "#ffffff30",
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.15em",
            }}
          >
            ROUND #{round}
          </div>
          {streak > 1 && (
            <div
              style={{
                fontSize: 12,
                color: "#f5c842",
                fontFamily: "'DM Mono',monospace",
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              🔥 {streak}× STREAK
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 10,
              color: "#ffffff30",
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.12em",
            }}
          >
            BANK
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: "#f5c842",
              fontFamily: "'Bebas Neue',sans-serif",
              letterSpacing: "0.05em",
              lineHeight: 1,
            }}
          >
            {localeInt(bank)}
          </div>
          <div style={{ fontSize: 10, color: "#f5c84270", fontFamily: "'DM Mono',monospace" }}>$GPAY</div>
        </div>
      </div>

      {/* Title */}
      <div
        style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 60,
          letterSpacing: "0.12em",
          color: "transparent",
          backgroundImage: "linear-gradient(180deg,#c084fc 0%,#7c3aed 55%,#3b0764 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          filter: "drop-shadow(0 0 24px #7c3aed90)",
          lineHeight: 1,
          marginBottom: 2,
        }}
      >
        C-LO
      </div>

      <div
        style={{
          fontSize: 10,
          color: "#ffffff30",
          fontFamily: "'DM Mono',monospace",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#10b981",
            display: "inline-block",
            animation: "pulse 1.5s ease infinite",
          }}
        />
        {PLAYERS.length} players · watching
      </div>

      {/* Player rail */}
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          display: "flex",
          gap: 10,
          overflowX: "auto",
          marginBottom: 14,
          padding: "4px 0",
        }}
      >
        {PLAYERS.map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              minWidth: 52,
              opacity: activeP === i ? 1 : 0.4,
              transition: "all 0.5s",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `radial-gradient(circle,${p.color}25,${p.color}08)`,
                border: `2px solid ${activeP === i ? p.color : p.color + "25"}`,
                boxShadow: activeP === i ? `0 0 18px ${p.color}70` : "none",
                transition: "all 0.5s",
              }}
            >
              {p.emoji}
            </div>
            <span
              style={{
                fontSize: 8,
                color: "#ffffff60",
                fontFamily: "'DM Mono',monospace",
                maxWidth: 48,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </span>
            <span
              style={{
                fontSize: 9,
                color: p.color,
                fontFamily: "'DM Mono',monospace",
                fontWeight: 700,
              }}
            >
              {p.bet}
            </span>
          </div>
        ))}
      </div>

      {/* Dice arena */}
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "linear-gradient(180deg,#0d001f 0%,#040010 100%)",
          borderRadius: 24,
          border: `1px solid ${isRolling ? "#f5c84250" : "#7c3aed30"}`,
          boxShadow: isRolling
            ? "0 0 50px #f5c84228,0 0 100px #f5c84210"
            : "0 0 30px #7c3aed20",
          padding: "40px 24px",
          marginBottom: 16,
          position: "relative",
          overflow: "hidden",
          transition: "border 0.4s,box-shadow 0.4s",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background: "repeating-linear-gradient(0deg,transparent,transparent 3px,#ffffff04 3px,#ffffff04 4px)",
            pointerEvents: "none",
          }}
        />
        {isRolling && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 10,
              color: "#f5c842",
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.25em",
              animation: "pulse 0.35s ease infinite",
              zIndex: 2,
            }}
          >
            ● ROLLING ●
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, perspective: 600 }}>
          {[0, 1, 2].map((i) => (
            <Die key={i} idx={i} rollState={rollState} finalValue={finalDice[i]} delay={i * 120} />
          ))}
        </div>
      </div>

      {/* Outcome */}
      {outcome && phase === "result" && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 14,
            animation: "popIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue',sans-serif",
              fontSize: 56,
              color: oc,
              letterSpacing: "0.1em",
              lineHeight: 1,
              filter: `drop-shadow(0 0 28px ${oc})`,
            }}
          >
            {outcome.label}
          </div>
          <div
            style={{
              fontSize: 11,
              color: oc + "90",
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.15em",
              marginTop: 2,
            }}
          >
            {outcome.sub}
          </div>
        </div>
      )}

      {/* Voice Chat */}
      <VoiceBar maxWidth={440} />
      {roomId ? (
        <div style={{ width: "100%", maxWidth: 440, marginBottom: 14 }}>
          <VoiceChat roomId={roomId} />
        </div>
      ) : null}

      {/* Live feed */}
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#0a001a",
          borderRadius: 14,
          border: "1px solid #7c3aed20",
          padding: "8px 12px",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: "#ffffff25",
            fontFamily: "'DM Mono',monospace",
            letterSpacing: "0.2em",
            marginBottom: 6,
          }}
        >
          ● LIVE FEED
        </div>
        <div
          style={{
            height: 100,
            overflowY: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            mask: "linear-gradient(transparent,black 20%,black 80%,transparent)",
          }}
        >
          {feed.slice(-6).map((m, i, arr) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: i === arr.length - 1 ? "#f5c842" : "#ffffff50",
                fontFamily: "'DM Mono',monospace",
                letterSpacing: "0.02em",
                padding: "2px 6px",
                background: i === arr.length - 1 ? "#f5c84210" : "transparent",
                borderLeft: `2px solid ${i === arr.length - 1 ? "#f5c842" : "transparent"}`,
                borderRadius: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transition: "all 0.3s",
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>

      {/* Bet selector */}
      <div style={{ width: "100%", maxWidth: 440, display: "flex", gap: 6, marginBottom: 12 }}>
        {[50, 100, 250, 500, 1000].map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBet(b)}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 10,
              border: `1px solid ${bet === b ? "#f5c842" : "#ffffff12"}`,
              background: bet === b ? "#f5c84218" : "transparent",
              color: bet === b ? "#f5c842" : "#ffffff35",
              fontSize: 11,
              fontFamily: "'DM Mono',monospace",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {b >= 1000 ? "1K" : b}
          </button>
        ))}
      </div>

      {/* CTA */}
      {phase !== "result" ? (
        <button
          type="button"
          onClick={handleRoll}
          disabled={isRolling}
          style={{
            width: "100%",
            maxWidth: 440,
            padding: "18px 0",
            borderRadius: 16,
            border: "none",
            background: isRolling ? "#7c3aed50" : "linear-gradient(135deg,#9333ea,#7c3aed)",
            color: "#fff",
            fontSize: 18,
            fontFamily: "'Bebas Neue',sans-serif",
            letterSpacing: "0.2em",
            cursor: isRolling ? "not-allowed" : "pointer",
            boxShadow: isRolling ? "none" : "0 0 30px #7c3aed60,0 4px 20px #7c3aed40",
            animation: !isRolling && phase === "idle" ? "glow 2s ease infinite" : "none",
            transition: "all 0.3s",
          }}
        >
          {isRolling ? "ROLLING..." : `🎲  ROLL · ${bet} $GPAY`}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPhase("idle");
            setOutcome(null);
            setRollState("idle");
          }}
          style={{
            width: "100%",
            maxWidth: 440,
            padding: "18px 0",
            borderRadius: 16,
            border: `2px solid ${oc}`,
            background: `${oc}18`,
            color: oc,
            fontSize: 18,
            fontFamily: "'Bebas Neue',sans-serif",
            letterSpacing: "0.2em",
            cursor: "pointer",
            boxShadow: `0 0 24px ${oc}50`,
            animation: "popIn 0.3s ease forwards",
            transition: "all 0.3s",
          }}
        >
          {outcome?.type === "win" ? "🔥  ROLL AGAIN" : outcome?.type === "loss" ? "💀  RUN IT BACK" : "🎯  SET POINT →"}
        </button>
      )}

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: "#ffffff20",
          fontFamily: "'DM Mono',monospace",
          letterSpacing: "0.1em",
        }}
      >
        Balance: <span style={{ color: "#f5c842" }}>{localeInt(bank)} $GPAY</span>
      </div>
    </div>
  );
}
