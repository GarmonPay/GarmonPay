"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  GRAVITY,
  BALL_RADIUS,
  VELOCITY_CAP,
  BOUNCE_COEF,
  FRICTION,
  FLIPPER_LENGTH,
  FLIPPER_REST_ANGLE,
  FLIPPER_ACTIVE_ANGLE,
  FLIPPER_SPEED,
  BUMPER_RADIUS,
  BUMPER_BOOST,
  BUMPER_MIN_SPEED,
  GARMON_BONUS,
  JACKPOT_BONUS_POINTS,
  MULTIBALL_POINT_MULT,
  clampSpeed,
  distance,
  circleCircle,
  reflect,
  flipperEndpoints,
  pointToSegment,
  BUMPER_POINTS,
  DRAIN_GRACE_MS,
} from "@/lib/pinball-physics";

const TABLE_W = 400;
const TABLE_H = 600;
const WALL_THICK = 16;
const PLAYFIELD_X = WALL_THICK;
const PLAYFIELD_Y = 52;
const PLAYFIELD_W = TABLE_W - WALL_THICK * 2;
const PLAYFIELD_H = TABLE_H - PLAYFIELD_Y - WALL_THICK;
const FLIPPER_Y = TABLE_H - WALL_THICK - 35;
const LEFT_FLIPPER_PIVOT_X = PLAYFIELD_X + 45;
const RIGHT_FLIPPER_PIVOT_X = TABLE_W - WALL_THICK - 45;
const DRAIN_Y = FLIPPER_Y + 25;
const PLUNGER_X = TABLE_W - WALL_THICK - 25;
const PLUNGER_Y = 420;

const BUMPERS: { x: number; y: number; emoji: string; glow: string }[] = [
  { x: 200, y: 160, emoji: "🥊", glow: "#c1272d" },
  { x: 120, y: 260, emoji: "💰", glow: "#22c55e" },
  { x: 280, y: 260, emoji: "🪙", glow: "#eab308" },
  { x: 100, y: 360, emoji: "📱", glow: "#3b82f6" },
  { x: 300, y: 360, emoji: "💎", glow: "#a855f7" },
  { x: 200, y: 320, emoji: "🏆", glow: "#f59e0b" },
];

const GARMON_LANES = "GARMON".split("").map((letter, i) => ({
  letter,
  x: PLAYFIELD_X + 35 + i * 52,
  y: PLAYFIELD_Y + 18,
  w: 40,
  h: 22,
}));

const JACKPOT_TARGET = { x: 200, y: 95, w: 70, h: 28 };

export type PinballGameProps = {
  sessionId?: string | null;
  mode?: "free" | "h2h" | "tournament";
  onGameEnd?: (
    score: number,
    stats?: { hits: { bumper: string; t: number }[]; durationMs?: number; ballsUsed?: number }
  ) => void;
  opponentScore?: number;
  jackpotLit?: boolean;
  jackpotLitUntil?: number;
};

type Ball = { x: number; y: number; vx: number; vy: number; inPlay: boolean };
type ScorePopup = { x: number; y: number; text: string; life: number };

export function PinballGame({
  sessionId = null,
  mode = "free",
  onGameEnd,
  opponentScore = 0,
  jackpotLit = false,
  jackpotLitUntil = 0,
}: PinballGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [multiplier, setMultiplier] = useState(1);
  const [garmonLetters, setGarmonLetters] = useState<Set<string>>(new Set());
  const [multiballActive, setMultiballActive] = useState(false);
  const [jackpotLitState, setJackpotLitState] = useState(jackpotLit);
  const [tiltWarning, setTiltWarning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [combo, setCombo] = useState(0);
  const [rampMultiplierActive, setRampMultiplierActive] = useState(false);

  const ballsRef = useRef<Ball[]>([]);
  const leftFlipperAngleRef = useRef(FLIPPER_REST_ANGLE);
  const rightFlipperAngleRef = useRef(FLIPPER_ACTIVE_ANGLE);
  const leftFlipperDownRef = useRef(false);
  const rightFlipperDownRef = useRef(false);
  const plungerChargeRef = useRef(0);
  const plungerHoldingRef = useRef(false);
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const hitLogRef = useRef<{ bumper: string; t: number }[]>([]);
  const lastBumperHitRef = useRef<number>(0);
  const comboResetWallRef = useRef(false);
  const multiballEndTimeRef = useRef(0);
  const rampMultiplierEndRef = useRef(0);
  const jackpotLitEndRef = useRef(jackpotLitUntil || 0);
  const shakeRef = useRef({ x: 0, y: 0 });
  const ballInDrainZoneRef = useRef(false);
  const drainGraceRef = useRef(0);
  const tiltCountRef = useRef(0);
  const tiltOutTriggerRef = useRef(false);
  const lastTiltTimeRef = useRef(0);
  const gameEndedRef = useRef(false);
  const ballTrailRef = useRef<{ x: number; y: number }[]>([]);
  const scaleRef = useRef(1);
  const oxRef = useRef(0);
  const oyRef = useRef(0);
  const scoreRef = useRef(0);
  const gameStartTimeRef = useRef(Date.now());
  const ballsUsedRef = useRef(0);
  scoreRef.current = score;

  const addScore = useCallback((pts: number, x: number, y: number) => {
    const mult = rampMultiplierEndRef.current > Date.now() ? 2 : 1;
    const multiballMult = multiballEndTimeRef.current > Date.now() ? MULTIBALL_POINT_MULT : 1;
    const total = Math.round(pts * mult * multiballMult * (multiplier || 1));
    setScore((s) => s + total);
    scorePopupsRef.current.push({ x, y, text: `+${total}`, life: 1 });
  }, [multiplier]);

  const spawnBall = useCallback((x: number, y: number) => {
    ballsRef.current.push({
      x,
      y,
      vx: 0,
      vy: 0,
      inPlay: true,
    });
  }, []);

  const launchFromPlunger = useCallback((charge: number) => {
    const power = Math.min(1, Math.max(0, charge)) * 18;
    const idx = ballsRef.current.findIndex((b) => b.inPlay && b.y > TABLE_H - 120);
    if (idx >= 0) {
      ballsRef.current[idx].vx = -power * 0.3;
      ballsRef.current[idx].vy = -power * 0.95;
    }
  }, []);

  useEffect(() => {
    jackpotLitEndRef.current = jackpotLitUntil || 0;
    setJackpotLitState(jackpotLit);
  }, [jackpotLit, jackpotLitUntil]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.DeviceMotionEvent) return;
    const TILT_THRESHOLD = 15;
    const TILT_COOLDOWN_MS = 800;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const now = Date.now();
      if (now - lastTiltTimeRef.current < TILT_COOLDOWN_MS) return;
      const x = a.x ?? 0;
      const y = a.y ?? 0;
      const z = a.z ?? 0;
      const mag = Math.sqrt(x * x + y * y + z * z);
      if (mag > 20 || Math.abs(x) > TILT_THRESHOLD || Math.abs(y) > TILT_THRESHOLD) {
        lastTiltTimeRef.current = now;
        tiltCountRef.current += 1;
        setTiltWarning(true);
        setTimeout(() => setTiltWarning(false), 600);
        if (tiltCountRef.current >= 3) {
          tiltOutTriggerRef.current = true;
        }
      }
    };
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    scaleRef.current = Math.min(cw / TABLE_W, ch / TABLE_H, 2);
    oxRef.current = (cw - TABLE_W * scaleRef.current) / 2;
    oyRef.current = (ch - TABLE_H * scaleRef.current) / 2;
    canvas.width = cw;
    canvas.height = ch;

    if (ballsRef.current.length === 0) {
      spawnBall(PLUNGER_X - 15, PLUNGER_Y);
    }
  }, [spawnBall]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameEndedRef.current) return;

    let rafId: number;
    const now = () => Date.now();

    const loop = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx || gameEndedRef.current) return;

      const scale = scaleRef.current;
      const ox = oxRef.current;
      const oy = oyRef.current;
      const t = now();

      if (jackpotLitEndRef.current > 0 && t >= jackpotLitEndRef.current) {
        jackpotLitEndRef.current = 0;
        setJackpotLitState(false);
      }

      const leftDown = leftFlipperDownRef.current;
      const rightDown = rightFlipperDownRef.current;
      const targetLeft = leftDown ? FLIPPER_ACTIVE_ANGLE : FLIPPER_REST_ANGLE;
      const targetRight = rightDown ? FLIPPER_REST_ANGLE : FLIPPER_ACTIVE_ANGLE;
      leftFlipperAngleRef.current += (targetLeft - leftFlipperAngleRef.current) * 0.35;
      rightFlipperAngleRef.current += (targetRight - rightFlipperAngleRef.current) * 0.35;

      const leftAng = leftFlipperAngleRef.current;
      const rightAng = rightFlipperAngleRef.current;
      const left = flipperEndpoints(LEFT_FLIPPER_PIVOT_X, FLIPPER_Y, leftAng, FLIPPER_LENGTH);
      const right = flipperEndpoints(RIGHT_FLIPPER_PIVOT_X, FLIPPER_Y, rightAng, FLIPPER_LENGTH);

      comboResetWallRef.current = false;

      if (tiltOutTriggerRef.current) {
        const inPlay = ballsRef.current.filter((b) => b.inPlay);
        if (inPlay.length > 0) {
          inPlay[0].inPlay = false;
          tiltOutTriggerRef.current = false;
          tiltCountRef.current = 0;
          ballInDrainZoneRef.current = false;
          ballsUsedRef.current += 1;
          setLives((l) => {
            if (l <= 1) {
              gameEndedRef.current = true;
              setGameOver(true);
              onGameEnd?.(scoreRef.current, {
                hits: hitLogRef.current,
                durationMs: Date.now() - gameStartTimeRef.current,
                ballsUsed: ballsUsedRef.current,
              });
              return 0;
            }
            return l - 1;
          });
          if (ballsRef.current.filter((b) => b.inPlay).length === 0 && !gameEndedRef.current) {
            setTimeout(() => {
              tiltCountRef.current = 0;
              spawnBall(PLUNGER_X - 15, PLUNGER_Y);
            }, 800);
          }
        }
      }

      for (const ball of ballsRef.current) {
        if (!ball.inPlay) continue;

        ball.vy += GRAVITY;
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;
        ball.x += ball.vx;
        ball.y += ball.vy;

        let speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        const { vx: vxC, vy: vyC } = clampSpeed(ball.vx, ball.vy);
        ball.vx = vxC;
        ball.vy = vyC;
        speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

        if (ball.y >= DRAIN_Y && ball.y < DRAIN_Y + 30) {
          if (!ballInDrainZoneRef.current) {
            ballInDrainZoneRef.current = true;
            drainGraceRef.current = t + DRAIN_GRACE_MS;
          }
          if (t > drainGraceRef.current) {
            ball.inPlay = false;
            ballInDrainZoneRef.current = false;
            ballsUsedRef.current += 1;
            setLives((l) => {
              if (l <= 1) {
                gameEndedRef.current = true;
                setGameOver(true);
                onGameEnd?.(scoreRef.current, {
                  hits: hitLogRef.current,
                  durationMs: Date.now() - gameStartTimeRef.current,
                  ballsUsed: ballsUsedRef.current,
                });
                return 0;
              }
              return l - 1;
            });
            if (ballsRef.current.filter((b) => b.inPlay).length === 0 && !gameEndedRef.current) {
              setTimeout(() => {
                tiltCountRef.current = 0;
                spawnBall(PLUNGER_X - 15, PLUNGER_Y);
              }, 800);
            }
            continue;
          }
        } else {
          ballInDrainZoneRef.current = false;
        }

        if (ball.x < PLAYFIELD_X + BALL_RADIUS) {
          const { vx: vx2, vy: vy2 } = reflect(ball.vx, ball.vy, 1, 0, BOUNCE_COEF);
          ball.vx = vx2;
          ball.vy = vy2;
          ball.x = PLAYFIELD_X + BALL_RADIUS;
          comboResetWallRef.current = true;
        }
        if (ball.x > TABLE_W - WALL_THICK - BALL_RADIUS) {
          const { vx: vx2, vy: vy2 } = reflect(ball.vx, ball.vy, -1, 0, BOUNCE_COEF);
          ball.vx = vx2;
          ball.vy = vy2;
          ball.x = TABLE_W - WALL_THICK - BALL_RADIUS;
          comboResetWallRef.current = true;
        }
        if (ball.y < PLAYFIELD_Y + BALL_RADIUS) {
          const { vx: vx2, vy: vy2 } = reflect(ball.vx, ball.vy, 0, 1, BOUNCE_COEF);
          ball.vx = vx2;
          ball.vy = vy2;
          ball.y = PLAYFIELD_Y + BALL_RADIUS;
          comboResetWallRef.current = true;
        }

        for (const b of BUMPERS) {
          if (!circleCircle(ball.x, ball.y, BALL_RADIUS, b.x, b.y, BUMPER_RADIUS)) continue;
          const dx = ball.x - b.x;
          const dy = ball.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const nx = dx / dist;
          const ny = dy / dist;
          const { vx: vx2, vy: vy2 } = reflect(ball.vx, ball.vy, nx, ny, 1, BUMPER_BOOST);
          ball.vx = vx2;
          ball.vy = vy2;
          ball.x = b.x + nx * (BUMPER_RADIUS + BALL_RADIUS + 2);
          ball.y = b.y + ny * (BUMPER_RADIUS + BALL_RADIUS + 2);
          const pts = BUMPER_POINTS[b.emoji] ?? 100;
          hitLogRef.current.push({ bumper: b.emoji, t });
          lastBumperHitRef.current = t;
          if (comboResetWallRef.current) setCombo(0);
          else setCombo((c) => c + 1);
          const comboMult = Math.min(combo, 5);
          addScore(pts * Math.max(1, comboMult), ball.x, ball.y);
          if (pts >= 500) {
            shakeRef.current = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 };
          }
        }

        const j = JACKPOT_TARGET;
        if (
          ball.x >= j.x - j.w / 2 &&
          ball.x <= j.x + j.w / 2 &&
          ball.y >= j.y - j.h / 2 &&
  ball.y <= j.y + j.h / 2 &&
          jackpotLitEndRef.current > t
        ) {
          jackpotLitEndRef.current = 0;
          setJackpotLitState(false);
          addScore(JACKPOT_BONUS_POINTS, ball.x, ball.y);
          shakeRef.current = { x: 10, y: 10 };
        }

        for (const lane of GARMON_LANES) {
          if (
            ball.x >= lane.x &&
            ball.x <= lane.x + lane.w &&
            ball.y >= lane.y - 5 &&
            ball.y <= lane.y + lane.h + 5 &&
            ball.vy < 0
          ) {
            setGarmonLetters((prev) => {
              const next = new Set(prev);
              next.add(lane.letter);
              if (next.size >= 6) {
                addScore(GARMON_BONUS, ball.x, ball.y);
                setMultiballActive(true);
                multiballEndTimeRef.current = t + 30000;
                spawnBall(200, 280);
                setTimeout(() => setMultiballActive(false), 30000);
                return new Set();
              }
              return next;
            });
          }
        }

        const leftSeg = pointToSegment(ball.x, ball.y, left.x1, left.y1, left.x2, left.y2);
        if (leftSeg.distSq < (BALL_RADIUS + 4) ** 2) {
          const nx = ball.x - leftSeg.closestX;
          const ny = ball.y - leftSeg.closestY;
          const len = Math.sqrt(nx * nx + ny * ny) || 0.01;
          const { vx: vx2, vy: vy2 } = reflect(ball.vx, ball.vy, nx / len, ny / len, 0.9);
          ball.vx = vx2 + (leftDown ? 2 : 0);
          ball.vy = vy2 - (leftDown ? 3 : 0);
          ball.x += (nx / len) * (BALL_RADIUS + 5);
          ball.y += (ny / len) * (BALL_RADIUS + 5);
          comboResetWallRef.current = true;
        }
        const rightSeg = pointToSegment(ball.x, ball.y, right.x1, right.y1, right.x2, right.y2);
        if (rightSeg.distSq < (BALL_RADIUS + 4) ** 2) {
          const nx = ball.x - rightSeg.closestX;
          const ny = ball.y - rightSeg.closestY;
          const len = Math.sqrt(nx * nx + ny * ny) || 0.01;
          const { vx: vx2, vy: vy2 } = reflect(ball.vx, ball.vy, nx / len, ny / len, 0.9);
          ball.vx = vx2 - (rightDown ? 2 : 0);
          ball.vy = vy2 - (rightDown ? 3 : 0);
          ball.x += (nx / len) * (BALL_RADIUS + 5);
          ball.y += (ny / len) * (BALL_RADIUS + 5);
          comboResetWallRef.current = true;
        }

        if (comboResetWallRef.current) setCombo(0);
      }

      ballsRef.current = ballsRef.current.filter((b) => b.inPlay || b.y < TABLE_H + 50);
      ballTrailRef.current = ballsRef.current[0]
        ? [...ballTrailRef.current.slice(-12), { x: ballsRef.current[0].x, y: ballsRef.current[0].y }]
        : [];
      scorePopupsRef.current = scorePopupsRef.current
        .map((p) => ({ ...p, life: p.life - 0.03 }))
        .filter((p) => p.life > 0);
      shakeRef.current.x *= 0.85;
      shakeRef.current.y *= 0.85;

      ctx.save();
      ctx.translate(ox + shakeRef.current.x, oy + shakeRef.current.y);
      ctx.scale(scale, scale);

      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, TABLE_W, TABLE_H);
      for (let i = 0; i <= 20; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.beginPath();
        ctx.moveTo(0, i * 30);
        ctx.lineTo(TABLE_W, i * 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * 20, 0);
        ctx.lineTo(i * 20, TABLE_H);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 20;
      ctx.strokeRect(WALL_THICK, PLAYFIELD_Y, PLAYFIELD_W, PLAYFIELD_H);
      ctx.shadowBlur = 0;

      ctx.font = "bold 24px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f0a500";
      ctx.fillText("GARMONPAY PINBALL", TABLE_W / 2, 28);
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(`${score}`, TABLE_W / 2, 48);
      ctx.textAlign = "left";
      ctx.fillStyle = "#9ca3af";
      ctx.font = "12px system-ui";
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < lives ? "#f0a500" : "#374151";
        ctx.beginPath();
        ctx.arc(20 + i * 18, 48, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (multiballActive) {
        ctx.fillStyle = "rgba(245, 158, 11, 0.3)";
        ctx.fillRect(0, 0, TABLE_W, TABLE_H);
      }
      if (garmonLetters.size > 0) {
        ctx.fillStyle = "#f0a500";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        GARMON_LANES.forEach((lane) => {
          ctx.fillStyle = garmonLetters.has(lane.letter) ? "#f0a500" : "#374151";
          ctx.fillText(lane.letter, lane.x + lane.w / 2, lane.y + lane.h / 2 + 4);
        });
        ctx.textAlign = "left";
      }
      if (jackpotLitState || jackpotLitEndRef.current > t) {
        ctx.fillStyle = "#f0a500";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("JACKPOT LIT 🔥", JACKPOT_TARGET.x, JACKPOT_TARGET.y + 4);
        ctx.textAlign = "left";
      }
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(JACKPOT_TARGET.x - JACKPOT_TARGET.w / 2, JACKPOT_TARGET.y - JACKPOT_TARGET.h / 2, JACKPOT_TARGET.w, JACKPOT_TARGET.h);
      ctx.strokeStyle = jackpotLitState ? "#f0a500" : "#374151";
      ctx.lineWidth = 2;
      ctx.strokeRect(JACKPOT_TARGET.x - JACKPOT_TARGET.w / 2, JACKPOT_TARGET.y - JACKPOT_TARGET.h / 2, JACKPOT_TARGET.w, JACKPOT_TARGET.h);

      BUMPERS.forEach((b) => {
        ctx.shadowColor = b.glow;
        ctx.shadowBlur = 15;
        ctx.fillStyle = b.glow;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BUMPER_RADIUS + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#1f2937";
        ctx.beginPath();
        ctx.arc(b.x, b.y, BUMPER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = b.glow;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = "20px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(b.emoji, b.x, b.y);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      });

      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#f0a500";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left.x1, left.y1);
      ctx.lineTo(left.x2, left.y2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(right.x1, right.y1);
      ctx.lineTo(right.x2, right.y2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#374151";
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(PLUNGER_X, PLUNGER_Y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (plungerChargeRef.current > 0) {
        const g = ctx.createLinearGradient(PLUNGER_X - 20, PLUNGER_Y, PLUNGER_X + 20, PLUNGER_Y);
        g.addColorStop(0, "#22c55e");
        g.addColorStop(0.5, "#eab308");
        g.addColorStop(1, "#ef4444");
        ctx.fillStyle = g;
        ctx.fillRect(PLUNGER_X - 8, PLUNGER_Y - 25, 16 * plungerChargeRef.current, 8);
      }

      ballTrailRef.current.forEach((p, i) => {
        ctx.globalAlpha = (i / ballTrailRef.current.length) * 0.5;
        ctx.fillStyle = "#f0a500";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      for (const ball of ballsRef.current) {
        if (!ball.inPlay) continue;
        const gr = ctx.createRadialGradient(
          ball.x - 5,
          ball.y - 5,
          0,
          ball.x,
          ball.y,
          BALL_RADIUS + 5
        );
        gr.addColorStop(0, "#fef3c7");
        gr.addColorStop(0.5, "#f0a500");
        gr.addColorStop(1, "#b45309");
        ctx.fillStyle = gr;
        ctx.shadowColor = "#f0a500";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      scorePopupsRef.current.forEach((p) => {
        ctx.font = "bold 14px system-ui";
        ctx.fillStyle = "#f0a500";
        ctx.globalAlpha = p.life;
        ctx.fillText(p.text, p.x, p.y - 20 - (1 - p.life) * 30);
        ctx.globalAlpha = 1;
      });

      if (opponentScore > 0) {
        ctx.font = "12px monospace";
        ctx.fillStyle = "#9ca3af";
        ctx.textAlign = "right";
        ctx.fillText(`Opp: ${opponentScore}`, TABLE_W - 20, 48);
        ctx.textAlign = "left";
      }
      if (combo > 1) {
        ctx.font = "bold 14px monospace";
        ctx.fillStyle = "#f0a500";
        ctx.fillText(`x${combo} COMBO`, TABLE_W / 2 - 40, 70);
      }

      ctx.restore();

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [score, lives, combo, garmonLetters, multiballActive, jackpotLitState, multiplier, rampMultiplierActive, opponentScore, addScore, spawnBall, onGameEnd]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scale = scaleRef.current;
      const ox = oxRef.current;
      const oy = oyRef.current;
      const x = (e.clientX - rect.left - ox) / scale;
      const y = (e.clientY - rect.top - oy) / scale;
      if (x < TABLE_W / 2) {
        leftFlipperDownRef.current = true;
      } else {
        if (x > PLUNGER_X - 30 && x < PLUNGER_X + 30 && y > PLUNGER_Y - 30 && y < PLUNGER_Y + 30) {
          plungerHoldingRef.current = true;
          plungerChargeRef.current = 0;
        } else {
          rightFlipperDownRef.current = true;
        }
      }
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (plungerHoldingRef.current) {
        launchFromPlunger(plungerChargeRef.current);
        plungerHoldingRef.current = false;
        plungerChargeRef.current = 0;
      }
      leftFlipperDownRef.current = false;
      rightFlipperDownRef.current = false;
    },
    [launchFromPlunger]
  );

  useEffect(() => {
    let chargeInterval: ReturnType<typeof setInterval>;
    if (plungerHoldingRef.current) {
      chargeInterval = setInterval(() => {
        if (plungerHoldingRef.current) {
          plungerChargeRef.current = Math.min(1, (plungerChargeRef.current || 0) + 0.03);
        }
      }, 16);
    }
    return () => clearInterval(chargeInterval);
  }, []);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "touch") {
        leftFlipperDownRef.current = false;
        rightFlipperDownRef.current = false;
        if (plungerHoldingRef.current) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left - oxRef.current) / scaleRef.current;
            const y = (e.clientY - rect.top - oyRef.current) / scaleRef.current;
            if (x > PLUNGER_X - 30 && x < PLUNGER_X + 30 && y > PLUNGER_Y - 30 && y < PLUNGER_Y + 30) {
              launchFromPlunger(plungerChargeRef.current);
            }
          }
          plungerHoldingRef.current = false;
          plungerChargeRef.current = 0;
        }
      }
    };
    window.addEventListener("pointerup", handler);
    window.addEventListener("pointercancel", handler);
    return () => {
      window.removeEventListener("pointerup", handler);
      window.removeEventListener("pointercancel", handler);
    };
  }, [launchFromPlunger]);

  return (
    <div className="relative w-full min-h-[500px] bg-[#0d1117] rounded-xl overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full touch-none"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          leftFlipperDownRef.current = false;
          rightFlipperDownRef.current = false;
          if (plungerHoldingRef.current) {
            launchFromPlunger(plungerChargeRef.current);
            plungerHoldingRef.current = false;
            plungerChargeRef.current = 0;
          }
        }}
      />
      {tiltWarning && (
        <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/20 pointer-events-none">
          <p className="text-yellow-400 font-bold">TILT WARNING</p>
        </div>
      )}
      {gameOver && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <p className="text-2xl font-bold text-white">Game Over</p>
          <p className="text-[#f0a500] text-xl mt-2">Score: {score}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 rounded-lg bg-[#f0a500] text-black font-bold"
          >
            Back to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
