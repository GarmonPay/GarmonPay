"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Matter from "matter-js";

const COLORS = {
  neonBlue: "#00f0ff",
  neonGreen: "#39ff14",
  neonPurple: "#bf00ff",
  pink: "#ff00ff",
  gold: "#ffd700",
  bg: "#0a0a12",
  playfield: "#0d1f0d",
  playfieldHighlight: "#142814",
  cabinet: "#1a0a0a",
  rail: "#00c8ff",
  chromeHighlight: "#e8f4fc",
  chromeMid: "#8a9ba8",
  chromeShadow: "#2a3540",
  rubber: "#1a1a1a",
  woodDark: "#2a1810",
  woodMid: "#4a2818",
  woodLight: "#6b3d28",
};

const BUMPER_SCORE = 100;
const JACKPOT_SCORE = 5000;
const SPINNER_SCORE = 50;
const COMBO_DECAY_MS = 800;
const MULTIBALL_JACKPOT_COUNT = 3;
const MULTIBALL_JACKPOT_WINDOW_MS = 10000;
const MULTIBALL_EXTRA_BALLS = 3;
const MULTIBALL_MULTIPLIER = 3;

type PinballGameProps = {
  sessionId: string;
  onGameEnd: (score: number) => void;
};

export function PinballGame({ sessionId, onGameEnd }: PinballGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const leftFlipperRef = useRef<Matter.Body | null>(null);
  const rightFlipperRef = useRef<Matter.Body | null>(null);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const lastComboTimeRef = useRef(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [jackpotMode, setJackpotMode] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const flipperLeftDown = useRef(false);
  const flipperRightDown = useRef(false);
  const flipperSoundPlayed = useRef({ left: false, right: false });
  const audioContextRef = useRef<AudioContext | null>(null);
  const gameEndedRef = useRef(false);
  const ballTrailRef = useRef<{ x: number; y: number }[]>([]);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; hue: number }[]>([]);
  const animTimeRef = useRef(0);
  const ballsRef = useRef<Matter.Body[]>([]);
  const jackpotHitTimesRef = useRef<number[]>([]);
  const multiplierRef = useRef(1);
  const multiballModeRef = useRef(false);
  const [multiballMode, setMultiballMode] = useState(false);
  const jackpotLaneUnlockedRef = useRef(false);
  const dropTargetsRef = useRef<{ body: Matter.Body; dropped: boolean; startY: number }[]>([]);
  const bumperDataRef = useRef<{ body: Matter.Body; cx: number; cy: number; orbitR: number; phase: number; lastHit: number }[]>([]);
  const shakeRef = useRef({ x: 0, y: 0 });
  const scoreScaleRef = useRef(1);
  const lastScoreDisplayRef = useRef(0);
  const spinnerComboRef = useRef(0);
  const lastSpinnerTimeRef = useRef(0);

  const playSound = useCallback((type: "bumper" | "jackpot" | "flipper" | "drain" | "multiball") => {
    try {
      const ctx = audioContextRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (!audioContextRef.current) audioContextRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "bumper") {
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === "jackpot") {
        [300, 500, 800, 1200].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.value = f;
          g.gain.setValueAtTime(0.2, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          o.start(ctx.currentTime + i * 0.05);
          o.stop(ctx.currentTime + 0.4);
        });
      } else if (type === "flipper") {
        osc.frequency.value = 120;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.06);
      } else if (type === "multiball") {
        [400, 600, 800, 1000].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.value = f;
          g.gain.setValueAtTime(0.15, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          o.start(ctx.currentTime + i * 0.04);
          o.stop(ctx.currentTime + 0.35);
        });
      } else {
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sessionId) return;

    const cw = (canvas.width = canvas.offsetWidth);
    const ch = (canvas.height = canvas.offsetHeight);
    const scale = Math.min(cw / 400, ch / 600);
    const w = 400 * scale;
    const h = 600 * scale;
    const ox = (cw - w) / 2;
    const oy = (ch - h) / 2;

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.1 } });
    engineRef.current = engine;
    const { world } = engine;

    const wallOpts: Matter.IChamferableBodyDefinition = { isStatic: true, restitution: 0.65, friction: 0 };
    const wallH = 20;
    Matter.World.add(world, [
      Matter.Bodies.rectangle(200, -wallH / 2, 420, wallH, wallOpts),
      Matter.Bodies.rectangle(200, 600 + wallH / 2, 420, wallH, wallOpts),
      Matter.Bodies.rectangle(-wallH / 2, 300, wallH, 640, wallOpts),
      Matter.Bodies.rectangle(400 + wallH / 2, 300, wallH, 640, wallOpts),
    ]);

    const flipperW = 60;
    const flipperH = 12;
    const flipperY = 560;
    const leftFlipper = Matter.Bodies.rectangle(120, flipperY, flipperW, flipperH, {
      isStatic: true,
      angle: 0.35,
      friction: 0.7,
      restitution: 0.95,
    } as Matter.IChamferableBodyDefinition);
    const rightFlipper = Matter.Bodies.rectangle(280, flipperY, flipperW, flipperH, {
      isStatic: true,
      angle: -0.35,
      friction: 0.7,
      restitution: 0.95,
    } as Matter.IChamferableBodyDefinition);
    Matter.World.add(world, [leftFlipper, rightFlipper]);
    leftFlipperRef.current = leftFlipper;
    rightFlipperRef.current = rightFlipper;

    const bumperOpts: Matter.IBodyDefinition = { isStatic: true, restitution: 1.35, friction: 0, label: "bumper" };
    const bumperPositions = [
      { cx: 200, cy: 180, orbitR: 0, phase: 0 },
      { cx: 120, cy: 280, orbitR: 18, phase: 0 },
      { cx: 280, cy: 280, orbitR: 18, phase: Math.PI },
      { cx: 160, cy: 380, orbitR: 14, phase: Math.PI / 2 },
      { cx: 240, cy: 380, orbitR: 14, phase: -Math.PI / 2 },
    ];
    const bumpers = bumperPositions.map((p, i) => {
      const radii = [28, 24, 24, 22, 22];
      const b = Matter.Bodies.circle(p.cx, p.cy, radii[i], bumperOpts);
      (b as Matter.Body & { label?: string }).label = "bumper";
      return b;
    });
    bumperDataRef.current = bumperPositions.map((p, i) => ({
      body: bumpers[i],
      cx: p.cx,
      cy: p.cy,
      orbitR: p.orbitR,
      phase: p.phase,
      lastHit: 0,
    }));
    Matter.World.add(world, bumpers);

    const spinnerOpts: Matter.IChamferableBodyDefinition = { isStatic: true, restitution: 0.9, friction: 0, label: "spinner" };
    const spinner1 = Matter.Bodies.rectangle(80, 140, 16, 40, spinnerOpts);
    const spinner2 = Matter.Bodies.rectangle(320, 140, 16, 40, spinnerOpts);
    (spinner1 as Matter.Body & { label?: string }).label = "spinner";
    (spinner2 as Matter.Body & { label?: string }).label = "spinner";
    Matter.World.add(world, [spinner1, spinner2]);

    const dropTargetOpts: Matter.IChamferableBodyDefinition = { isStatic: true, restitution: 0.5, friction: 0, label: "droptarget" };
    const dropYs = [105, 105, 105, 105, 105];
    const dropXs = [80, 130, 200, 270, 320];
    const dropTargets = dropXs.map((x, i) => Matter.Bodies.rectangle(x, dropYs[i], 36, 20, dropTargetOpts));
    dropTargets.forEach((d) => ((d as Matter.Body & { label?: string }).label = "droptarget"));
    dropTargetsRef.current = dropTargets.map((body, i) => ({ body, dropped: false, startY: dropYs[i] }));
    Matter.World.add(world, dropTargets);

    const jackpotZone = Matter.Bodies.rectangle(200, 80, 80, 30, {
      isStatic: true,
      isSensor: true,
      label: "jackpot",
    } as Matter.IChamferableBodyDefinition);
    Matter.World.add(world, jackpotZone);

    const createBall = () =>
      Matter.Bodies.circle(200, 300, 10, {
        restitution: 0.85,
        friction: 0.001,
        density: 0.004,
        label: "ball",
      });
    const ball = createBall();
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    Matter.World.add(world, ball);
    ballRef.current = ball;
    ballsRef.current = [ball];

    Matter.Events.on(engine, "collisionStart", (event) => {
      const pairs = event.pairs;
      const now = Date.now();
      for (const p of pairs) {
        const a = p.bodyA;
        const b = p.bodyB;
        if (now - lastComboTimeRef.current > COMBO_DECAY_MS) comboRef.current = 0;
        lastComboTimeRef.current = now;

        if ((a.label === "bumper" || b.label === "bumper") && (a.label === "ball" || b.label === "ball")) {
          const bumperBody = a.label === "bumper" ? a : b;
          bumperDataRef.current.forEach((bd) => {
            if (bd.body === bumperBody) bd.lastHit = now;
          });
          comboRef.current += 1;
          const mult = Math.min(comboRef.current, 5) * multiplierRef.current;
          const add = BUMPER_SCORE * mult;
          scoreRef.current += add;
          setScore(scoreRef.current);
          setCombo(comboRef.current);
          scoreScaleRef.current = 1.25;
          shakeRef.current = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 };
          playSound("bumper");
          for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
            particlesRef.current.push({
              x: bumperBody.position.x,
              y: bumperBody.position.y,
              vx: Math.cos(angle) * 5,
              vy: Math.sin(angle) * 5,
              life: 1,
              hue: 280,
            });
          }
        }

        if ((a.label === "spinner" || b.label === "spinner") && (a.label === "ball" || b.label === "ball")) {
          if (now - lastSpinnerTimeRef.current > 400) spinnerComboRef.current = 0;
          lastSpinnerTimeRef.current = now;
          spinnerComboRef.current += 1;
          const mult = Math.min(spinnerComboRef.current, 5) * multiplierRef.current;
          const add = SPINNER_SCORE * mult;
          scoreRef.current += add;
          setScore(scoreRef.current);
          scoreScaleRef.current = 1.15;
          playSound("bumper");
        }

        if ((a.label === "droptarget" || b.label === "droptarget") && (a.label === "ball" || b.label === "ball")) {
          const dtBody = a.label === "droptarget" ? a : b;
          dropTargetsRef.current.forEach((dt) => {
            if (dt.body === dtBody && !dt.dropped) {
              dt.dropped = true;
              Matter.Body.setPosition(dt.body, { x: dt.body.position.x, y: 700 });
            }
          });
          const allDropped = dropTargetsRef.current.every((dt) => dt.dropped);
          if (allDropped) jackpotLaneUnlockedRef.current = true;
        }

        if ((a.label === "jackpot" || b.label === "jackpot") && (a.label === "ball" || b.label === "ball")) {
          if (!jackpotLaneUnlockedRef.current) continue;
          jackpotLaneUnlockedRef.current = false;
          scoreRef.current += JACKPOT_SCORE * multiplierRef.current;
          setScore(scoreRef.current);
          setJackpotMode(true);
          setTimeout(() => setJackpotMode(false), 1500);
          playSound("jackpot");
          dropTargetsRef.current.forEach((dt) => {
            dt.dropped = false;
            Matter.Body.setPosition(dt.body, { x: dt.body.position.x, y: dt.startY });
          });
          jackpotHitTimesRef.current.push(now);
          jackpotHitTimesRef.current = jackpotHitTimesRef.current.filter((t) => now - t < MULTIBALL_JACKPOT_WINDOW_MS);
          const ballBody = a.label === "ball" ? a : b;
          for (let i = 0; i < 24; i++) {
            const angle = (Math.PI * 2 * i) / 24;
            particlesRef.current.push({
              x: ballBody.position.x,
              y: ballBody.position.y,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              life: 1,
              hue: 120,
            });
          }
          if (jackpotHitTimesRef.current.length >= MULTIBALL_JACKPOT_COUNT && !multiballModeRef.current) {
            multiballModeRef.current = true;
            setMultiballMode(true);
            multiplierRef.current = MULTIBALL_MULTIPLIER;
            playSound("multiball");
            const world = engine.world;
            for (let i = 0; i < MULTIBALL_EXTRA_BALLS; i++) {
              const nb = createBall();
              Matter.Body.setPosition(nb, { x: 180 + i * 20, y: 280 });
              Matter.Body.setVelocity(nb, { x: (Math.random() - 0.5) * 4, y: -2 });
              Matter.World.add(world, nb);
              ballsRef.current.push(nb);
            }
            setTimeout(() => setMultiballMode(false), 8000);
            setTimeout(() => {
              multiballModeRef.current = false;
              multiplierRef.current = 1;
            }, 8000);
          }
        }
      }
    });

    let animId: number;
    const render = () => {
      if (gameEndedRef.current) return;

      const leftDown = flipperLeftDown.current;
      const rightDown = flipperRightDown.current;
      if (leftDown && !flipperSoundPlayed.current.left) {
        playSound("flipper");
        flipperSoundPlayed.current.left = true;
      }
      if (!leftDown) flipperSoundPlayed.current.left = false;
      if (rightDown && !flipperSoundPlayed.current.right) {
        playSound("flipper");
        flipperSoundPlayed.current.right = true;
      }
      if (!rightDown) flipperSoundPlayed.current.right = false;

      Matter.Body.setAngle(leftFlipper, leftDown ? -0.35 : 0.35);
      Matter.Body.setAngle(rightFlipper, rightDown ? 0.35 : -0.35);

      Matter.Engine.update(engine, 1000 / 60);

      animTimeRef.current += 1;
      const t = animTimeRef.current * 0.05;
      bumperDataRef.current.forEach((bd, i) => {
        const angle = bd.phase + t * 0.4;
        Matter.Body.setPosition(bd.body, {
          x: bd.cx + bd.orbitR * Math.cos(angle),
          y: bd.cy + bd.orbitR * Math.sin(angle),
        });
      });

      ballsRef.current = ballsRef.current.filter((ballBody) => {
        if (ballBody.position.y > 620) {
          Matter.World.remove(world, ballBody);
          dropTargetsRef.current.forEach((dt) => {
            dt.dropped = false;
            Matter.Body.setPosition(dt.body, { x: dt.body.position.x, y: dt.startY });
          });
          return false;
        }
        return true;
      });
      if (ballsRef.current.length === 0) {
        gameEndedRef.current = true;
        playSound("drain");
        setGameOver(true);
        onGameEnd(scoreRef.current);
        Matter.Engine.clear(engine);
        engineRef.current = null;
        ballRef.current = null;
        leftFlipperRef.current = null;
        rightFlipperRef.current = null;
        ballsRef.current = [];
        return;
      }
      ballRef.current = ballsRef.current[0];

      const pulse = 0.85 + 0.15 * Math.sin(t);

      ballTrailRef.current.push({ x: ballsRef.current[0].position.x, y: ballsRef.current[0].position.y });
      if (ballTrailRef.current.length > 14) ballTrailRef.current.shift();

      particlesRef.current = particlesRef.current
        .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.028 }))
        .filter((p) => p.life > 0);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      shakeRef.current.x *= 0.88;
      shakeRef.current.y *= 0.88;
      scoreScaleRef.current += (1 - scoreScaleRef.current) * 0.12;

      const pad = 8;
      const tableW = 400;
      const tableH = 600;
      const backglassH = 52;
      const playfieldY = backglassH;

      // Cabinet background (dark wood)
      ctx.fillStyle = COLORS.woodDark;
      ctx.fillRect(0, 0, cw, ch);
      const cabGrad = ctx.createLinearGradient(0, 0, cw, 0);
      cabGrad.addColorStop(0, "#1a0f0a");
      cabGrad.addColorStop(0.5, COLORS.woodDark);
      cabGrad.addColorStop(1, "#1a0f0a");
      ctx.fillStyle = cabGrad;
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.translate(ox + shakeRef.current.x, oy + shakeRef.current.y);
      ctx.scale(scale, scale);

      // Wood frame around entire table (bevel)
      const frameInset = 6;
      const woodFrame = (x: number, y: number, w: number, h: number) => {
        const lg = ctx.createLinearGradient(x, y, x + w, y + h);
        lg.addColorStop(0, COLORS.woodLight);
        lg.addColorStop(0.3, COLORS.woodMid);
        lg.addColorStop(0.7, COLORS.woodDark);
        lg.addColorStop(1, "#1a0f0a");
        ctx.fillStyle = lg;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      };
      woodFrame(-frameInset, -frameInset, tableW + frameInset * 2, tableH + frameInset * 2);

      // Backglass (lit display area)
      const bgInset = 4;
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(bgInset, bgInset, tableW - bgInset * 2, backglassH - 2);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, backglassH);
      bgGrad.addColorStop(0, "#1a1a35");
      bgGrad.addColorStop(0.4, "#0f0f22");
      bgGrad.addColorStop(1, "#080810");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(bgInset + 2, bgInset + 2, tableW - bgInset * 2 - 4, backglassH - 6);
      ctx.strokeStyle = COLORS.neonBlue;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 25;
      ctx.lineWidth = 2;
      ctx.strokeRect(bgInset + 2, bgInset + 2, tableW - bgInset * 2 - 4, backglassH - 6);
      ctx.shadowBlur = 0;
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.neonBlue;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 12;
      ctx.fillText("GARMONPAY", tableW / 2, 20);
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = COLORS.gold;
      ctx.shadowColor = COLORS.gold;
      ctx.fillText("PINBALL", tableW / 2, 36);
      ctx.shadowBlur = 0;
      ctx.font = "bold 16px monospace";
      ctx.fillStyle = COLORS.neonGreen;
      ctx.textAlign = "left";
      ctx.save();
      ctx.translate(16, 36);
      ctx.scale(scoreScaleRef.current, scoreScaleRef.current);
      ctx.fillText(`SCORE: ${scoreRef.current}`, 0, 0);
      ctx.restore();
      ctx.textAlign = "right";
      if (comboRef.current > 1) {
        ctx.fillStyle = COLORS.gold;
        ctx.fillText(`COMBO x${comboRef.current}`, tableW - 16, 36);
      }

      // Playfield (felt) with subtle weave
      const playfieldGrad = ctx.createRadialGradient(tableW / 2, 380, 0, tableW / 2, 380, 520);
      playfieldGrad.addColorStop(0, "#0f2a0f");
      playfieldGrad.addColorStop(0.4, COLORS.playfield);
      playfieldGrad.addColorStop(1, "#051505");
      ctx.fillStyle = playfieldGrad;
      ctx.fillRect(0, playfieldY, tableW, tableH - playfieldY);
      ctx.fillStyle = "rgba(0,255,100,0.02)";
      for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 36; j++) {
          if ((i + j) % 2 === 0) ctx.fillRect(j * 11, playfieldY + i * 22, 12, 23);
        }
      }

      // Wood rails with neon edge (inner playfield border)
      const railWidth = 16;
      const railInset = 8;
      const railGlow = pulse * 22;
      ctx.fillStyle = COLORS.woodMid;
      ctx.fillRect(0, playfieldY, tableW, railWidth);
      ctx.fillRect(0, playfieldY, railWidth, tableH - playfieldY);
      ctx.fillRect(tableW - railWidth, playfieldY, railWidth, tableH - playfieldY);
      ctx.fillRect(0, tableH - railWidth, tableW, railWidth);
      ctx.strokeStyle = COLORS.neonBlue;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = railGlow;
      ctx.lineWidth = 4;
      ctx.strokeRect(railInset, playfieldY + railInset, tableW - railInset * 2, tableH - playfieldY - railInset * 2);
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = "rgba(0,240,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(railInset + 6, playfieldY + railInset + 6, tableW - (railInset + 6) * 2, tableH - playfieldY - (railInset + 6) * 2);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Wireform-style arc paths (neon rails)
      ctx.strokeStyle = COLORS.neonPurple;
      ctx.shadowColor = COLORS.neonPurple;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(200, 220, 115, 0.22 * Math.PI, 0.78 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(100, 340, 75, -0.28 * Math.PI, 0.52 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(300, 340, 75, 0.48 * Math.PI, 1.28 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Drop targets (stand-up target look: red/white stripe, 3D bevel)
      dropTargetsRef.current.forEach((dt) => {
        if (dt.dropped) return;
        const x = dt.body.position.x;
        const y = dt.body.position.y;
        const w = 36;
        const h = 20;
        const bw = 3;
        ctx.fillStyle = "#8b0000";
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, (h - 4) / 2);
        ctx.fillStyle = "#8b0000";
        ctx.fillRect(x - w / 2 + 2, y - 2, w - 4, (h - 4) / 2);
        ctx.strokeStyle = "#400";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, 2);
        ctx.shadowColor = COLORS.neonBlue;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = COLORS.neonBlue;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.shadowBlur = 0;
      });

      // Spinners (rotating disc with stripes)
      const spinners = Matter.Composite.allBodies(world).filter((b) => b.label === "spinner");
      spinners.forEach((sp) => {
        const x = sp.position.x;
        const y = sp.position.y;
        const spinAngle = animTimeRef.current * 0.08;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spinAngle);
        const rad = 22;
        const sg = ctx.createRadialGradient(-rad * 0.3, -rad * 0.3, 0, 0, 0, rad);
        sg.addColorStop(0, "#666");
        sg.addColorStop(0.5, COLORS.gold);
        sg.addColorStop(1, "#664400");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#332200";
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.fillStyle = i % 2 === 0 ? "#ffcc00" : "#996600";
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, rad - 2, a, a + Math.PI / 4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.arc(-4, -4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Pop bumpers (dome style: base ring + dome with highlight)
      const now = Date.now();
      bumperDataRef.current.forEach((bd, i) => {
        const b = bd.body;
        const x = b.position.x;
        const y = b.position.y;
        const r = (b.bounds.max.x - b.bounds.min.x) / 2;
        const recentlyHit = now - bd.lastHit < 350;
        const bumpPulse = recentlyHit ? 1.35 : 0.92 + 0.08 * Math.sin(t + i);
        ctx.shadowBlur = 0;
        const baseR = r + 6;
        const baseGrad = ctx.createLinearGradient(x - baseR, y + baseR, x + baseR, y - baseR);
        baseGrad.addColorStop(0, "#1a1a1a");
        baseGrad.addColorStop(0.5, "#333");
        baseGrad.addColorStop(1, "#111");
        ctx.fillStyle = baseGrad;
        ctx.beginPath();
        ctx.arc(x, y, baseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 2;
        ctx.stroke();
        const domeGrad = ctx.createRadialGradient(
          x - r * 0.4,
          y - r * 0.4,
          0,
          x,
          y,
          r
        );
        domeGrad.addColorStop(0, recentlyHit ? "#ff88ff" : COLORS.pink);
        domeGrad.addColorStop(0.35, COLORS.neonPurple);
        domeGrad.addColorStop(0.8, "#300050");
        domeGrad.addColorStop(1, "#180028");
        ctx.fillStyle = domeGrad;
        ctx.shadowColor = COLORS.neonPurple;
        ctx.shadowBlur = recentlyHit ? 35 : 20 * bumpPulse;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,200,255,0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.22, -0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Jackpot lane (lit scoop)
      const jx = jackpotZone.position.x - 42;
      const jy = jackpotZone.position.y - 16;
      const jw = 84;
      const jh = 32;
      const jr = 6;
      const jGrad = ctx.createLinearGradient(jx, jy, jx + jw, jy + jh);
      jGrad.addColorStop(0, jackpotMode ? "#ffcc00" : "#0a4d0a");
      jGrad.addColorStop(0.5, jackpotMode ? "#ffdd44" : "#0d6b0d");
      jGrad.addColorStop(1, jackpotMode ? "#cc9900" : "#063806");
      ctx.fillStyle = jGrad;
      ctx.shadowColor = jackpotMode ? COLORS.gold : COLORS.neonGreen;
      ctx.shadowBlur = jackpotMode ? 40 : 28;
      ctx.beginPath();
      ctx.moveTo(jx + jr, jy);
      ctx.lineTo(jx + jw - jr, jy);
      ctx.quadraticCurveTo(jx + jw, jy, jx + jw, jy + jr);
      ctx.lineTo(jx + jw, jy + jh - jr);
      ctx.quadraticCurveTo(jx + jw, jy + jh, jx + jw - jr, jy + jh);
      ctx.lineTo(jx + jr, jy + jh);
      ctx.quadraticCurveTo(jx, jy + jh, jx, jy + jh - jr);
      ctx.lineTo(jx, jy + jr);
      ctx.quadraticCurveTo(jx, jy, jx + jr, jy);
      ctx.fill();
      ctx.strokeStyle = jackpotMode ? "#ffdd88" : "rgba(0,255,100,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = jackpotMode ? "#331100" : "#001100";
      ctx.textAlign = "center";
      ctx.fillText("JACKPOT", jackpotZone.position.x, jackpotZone.position.y + 5);

      // Drain slot (dark gap between flippers)
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(160, 548, 80, 28);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(162, 550, 76, 24);

      // Flippers (metal body + rubber pad, professional look)
      const flipperMetal = ctx.createLinearGradient(-flipperW / 2, 0, flipperW / 2, 0);
      flipperMetal.addColorStop(0, "#1a2530");
      flipperMetal.addColorStop(0.2, "#3a5568");
      flipperMetal.addColorStop(0.5, COLORS.neonBlue);
      flipperMetal.addColorStop(0.8, "#3a5568");
      flipperMetal.addColorStop(1, "#1a2530");
      ctx.save();
      ctx.translate(leftFlipper.position.x, leftFlipper.position.y);
      ctx.rotate(leftFlipper.angle);
      ctx.fillStyle = flipperMetal;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 16;
      ctx.fillRect(-flipperW / 2, -flipperH / 2, flipperW, flipperH);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-flipperW / 2, -flipperH / 2, flipperW, flipperH);
      ctx.fillStyle = COLORS.rubber;
      ctx.fillRect(-flipperW / 2 + 2, -flipperH / 2 + 2, flipperW * 0.5, flipperH - 4);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(-flipperW / 2 + 6, -flipperH / 2 + 3, flipperW * 0.35, 2);
      ctx.restore();
      ctx.save();
      ctx.translate(rightFlipper.position.x, rightFlipper.position.y);
      ctx.rotate(rightFlipper.angle);
      ctx.fillStyle = flipperMetal;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 16;
      ctx.fillRect(-flipperW / 2, -flipperH / 2, flipperW, flipperH);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = COLORS.rubber;
      ctx.fillRect(flipperW / 2 - flipperW * 0.5 - 2, -flipperH / 2 + 2, flipperW * 0.5, flipperH - 4);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(flipperW / 2 - flipperW * 0.35 - 6, -flipperH / 2 + 3, flipperW * 0.35, 2);
      ctx.restore();

      ballTrailRef.current.forEach((p, i) => {
        const alpha = (i + 1) / ballTrailRef.current.length;
        ctx.fillStyle = `rgba(180,200,220,${0.2 * alpha})`;
        ctx.shadowColor = "#88aacc";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      // Chrome/silver pinball (realistic metal ball)
      ballsRef.current.forEach((ballBody) => {
        const bx = ballBody.position.x;
        const by = ballBody.position.y;
        const br = 10;
        const ballGrad = ctx.createRadialGradient(
          bx - br * 0.5,
          by - br * 0.5,
          0,
          bx,
          by,
          br
        );
        ballGrad.addColorStop(0, COLORS.chromeHighlight);
        ballGrad.addColorStop(0.25, "#b0c4d8");
        ballGrad.addColorStop(0.5, COLORS.chromeMid);
        ballGrad.addColorStop(0.85, COLORS.chromeShadow);
        ballGrad.addColorStop(1, "#1a2028");
        ctx.fillStyle = ballGrad;
        ctx.shadowColor = "rgba(200,220,255,0.5)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.hue > 150 ? `hsla(${p.hue}, 100%, 60%, 0.9)` : `hsla(${p.hue}, 100%, 70%, 0.9)`;
        ctx.shadowColor = p.hue > 150 ? COLORS.neonGreen : COLORS.neonPurple;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.restore();

      ctx.shadowBlur = 0;
      if (jackpotMode) {
        ctx.fillStyle = COLORS.gold;
        ctx.shadowColor = COLORS.gold;
        ctx.shadowBlur = 25;
        ctx.font = "bold 32px monospace";
        ctx.textAlign = "center";
        ctx.fillText("JACKPOT!", cw / 2, backglassH * scale + oy + 28);
      }
      if (multiballModeRef.current) {
        const flash = 0.4 + 0.3 * Math.sin(animTimeRef.current * 0.2);
        ctx.fillStyle = `rgba(255,0,255,${flash})`;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = COLORS.neonPurple;
        ctx.shadowColor = COLORS.pink;
        ctx.shadowBlur = 30;
        ctx.font = "bold 28px monospace";
        ctx.textAlign = "center";
        ctx.fillText("MULTIBALL MODE", cw / 2, ch / 2 - 20);
        ctx.font = "bold 16px monospace";
        ctx.fillText(`x${MULTIBALL_MULTIPLIER} MULTIPLIER`, cw / 2, ch / 2 + 15);
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };
    render();

    const keyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyZ") {
        flipperLeftDown.current = true;
        e.preventDefault();
      }
      if (e.code === "ArrowRight" || e.code === "KeyM") {
        flipperRightDown.current = true;
        e.preventDefault();
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyZ") flipperLeftDown.current = false;
      if (e.code === "ArrowRight" || e.code === "KeyM") flipperRightDown.current = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
    };
  }, [sessionId, onGameEnd, playSound]);

  const handleTouchLeft = (down: boolean) => {
    flipperLeftDown.current = down;
  };
  const handleTouchRight = (down: boolean) => {
    flipperRightDown.current = down;
  };

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #2a1810 0%, #1a0f0a 30%, #0f0a08 100%)",
        border: "3px solid #3d2818",
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.5), 0 0 25px rgba(0,240,255,0.15), 0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div className="relative" style={{ height: "min(600px, 85vh)" }}>
        <canvas
          ref={canvasRef}
          className="w-full touch-none block"
          style={{ height: "min(600px, 85vh)", display: "block" }}
          width={400}
          height={600}
        />
        {/* Mobile: press-and-hold left/right half of playfield for flippers */}
        <div
          className="absolute top-0 bottom-0 left-0 w-1/2 touch-none"
          style={{ touchAction: "manipulation" }}
          onTouchStart={(e) => { e.preventDefault(); handleTouchLeft(true); }}
          onTouchEnd={(e) => { e.preventDefault(); handleTouchLeft(false); }}
          onTouchCancel={() => handleTouchLeft(false)}
          onMouseDown={() => handleTouchLeft(true)}
          onMouseUp={() => handleTouchLeft(false)}
          onMouseLeave={() => handleTouchLeft(false)}
          aria-label="Left flipper"
        />
        <div
          className="absolute top-0 bottom-0 right-0 w-1/2 touch-none"
          style={{ touchAction: "manipulation" }}
          onTouchStart={(e) => { e.preventDefault(); handleTouchRight(true); }}
          onTouchEnd={(e) => { e.preventDefault(); handleTouchRight(false); }}
          onTouchCancel={() => handleTouchRight(false)}
          onMouseDown={() => handleTouchRight(true)}
          onMouseUp={() => handleTouchRight(false)}
          onMouseLeave={() => handleTouchRight(false)}
          aria-label="Right flipper"
        />
      </div>
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-8 pointer-events-none">
        <span className="text-[#00f0ff] font-mono text-sm">Z / ← Left</span>
        <span className="text-[#00f0ff] font-mono text-sm">M / → Right</span>
      </div>
      <div className="flex justify-center gap-6 py-4 px-2 pointer-events-auto touch-manipulation">
        <button
          type="button"
          onTouchStart={() => handleTouchLeft(true)}
          onTouchEnd={() => handleTouchLeft(false)}
          onMouseDown={() => handleTouchLeft(true)}
          onMouseUp={() => handleTouchLeft(false)}
          onMouseLeave={() => handleTouchLeft(false)}
          className="flex-1 max-w-[140px] py-4 rounded-xl bg-[#00f0ff]/20 border-2 border-[#00f0ff] text-[#00f0ff] font-bold text-lg select-none"
          style={{ boxShadow: "0 0 20px rgba(0,240,255,0.3)" }}
        >
          LEFT FLIPPER
        </button>
        <button
          type="button"
          onTouchStart={() => handleTouchRight(true)}
          onTouchEnd={() => handleTouchRight(false)}
          onMouseDown={() => handleTouchRight(true)}
          onMouseUp={() => handleTouchRight(false)}
          onMouseLeave={() => handleTouchRight(false)}
          className="flex-1 max-w-[140px] py-4 rounded-xl bg-[#00f0ff]/20 border-2 border-[#00f0ff] text-[#00f0ff] font-bold text-lg select-none"
          style={{ boxShadow: "0 0 20px rgba(0,240,255,0.3)" }}
        >
          RIGHT FLIPPER
        </button>
      </div>
      {gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <p className="text-2xl font-bold text-[#39ff14]">Game Over</p>
            <p className="text-[#00f0ff] mt-2">Final Score: {score}</p>
          </div>
        </div>
      )}
    </div>
  );
}
