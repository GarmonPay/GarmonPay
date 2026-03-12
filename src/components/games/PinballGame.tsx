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

      ctx.fillStyle = COLORS.cabinet;
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.translate(ox + shakeRef.current.x, oy + shakeRef.current.y);
      ctx.scale(scale, scale);

      ctx.fillStyle = "#0d0d18";
      ctx.fillRect(-pad, -pad, tableW + pad * 2, backglassH + pad * 2);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, backglassH);
      bgGrad.addColorStop(0, "#1a1a2e");
      bgGrad.addColorStop(0.5, "#16213e");
      bgGrad.addColorStop(1, "#0f0f1a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, tableW, backglassH);
      ctx.strokeStyle = COLORS.neonBlue;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, tableW - 4, backglassH - 4);
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.neonBlue;
      ctx.shadowBlur = 30;
      ctx.fillText("GARMONPAY", tableW / 2, 22);
      ctx.font = "bold 14px monospace";
      ctx.fillStyle = COLORS.gold;
      ctx.shadowColor = COLORS.gold;
      ctx.shadowBlur = 15;
      ctx.fillText("PINBALL", tableW / 2, 40);
      ctx.shadowBlur = 0;
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = COLORS.neonGreen;
      ctx.textAlign = "left";
      ctx.save();
      ctx.translate(16, 36);
      ctx.scale(scoreScaleRef.current, scoreScaleRef.current);
      ctx.fillText(`SCORE: ${scoreRef.current}`, 0, 0);
      ctx.restore();
      ctx.textAlign = "right";
      if (comboRef.current > 1) ctx.fillText(`COMBO x${comboRef.current}`, tableW - 16, 36);

      const playfieldGrad = ctx.createRadialGradient(tableW / 2, 350, 0, tableW / 2, 350, 450);
      playfieldGrad.addColorStop(0, COLORS.playfieldHighlight);
      playfieldGrad.addColorStop(0.6, COLORS.playfield);
      playfieldGrad.addColorStop(1, "#081008");
      ctx.fillStyle = playfieldGrad;
      ctx.fillRect(0, playfieldY, tableW, tableH - playfieldY);
      ctx.fillStyle = "rgba(0,240,255,0.03)";
      for (let i = 0; i < 20; i++) {
        ctx.fillRect((i % 5) * 90 + 10, playfieldY + (Math.floor(i / 5) * 120) + 10, 80, 100);
      }

      const railWidth = 14;
      const railGlow = pulse * 18;
      ctx.strokeStyle = COLORS.rail;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = railGlow;
      ctx.lineWidth = railWidth;
      ctx.strokeRect(railWidth / 2 + 4, playfieldY + railWidth / 2 + 4, tableW - railWidth - 8, tableH - playfieldY - railWidth - 8);
      ctx.strokeStyle = COLORS.neonBlue;
      ctx.shadowBlur = railGlow * 0.6;
      ctx.lineWidth = 4;
      ctx.strokeRect(10, playfieldY + 10, tableW - 20, tableH - playfieldY - 20);
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "rgba(0,240,255,0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(18, playfieldY + 18, tableW - 36, tableH - playfieldY - 36);
      ctx.setLineDash([]);

      ctx.strokeStyle = COLORS.neonPurple;
      ctx.shadowColor = COLORS.neonPurple;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(200, 220, 120, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(100, 340, 80, -0.3 * Math.PI, 0.5 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(300, 340, 80, 0.5 * Math.PI, 1.3 * Math.PI);
      ctx.stroke();

      dropTargetsRef.current.forEach((dt) => {
        if (dt.dropped) return;
        const x = dt.body.position.x;
        const y = dt.body.position.y;
        const w = 36;
        const h = 20;
        ctx.fillStyle = "rgba(0,240,255,0.25)";
        ctx.shadowColor = COLORS.neonBlue;
        ctx.shadowBlur = 12;
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
        ctx.strokeStyle = COLORS.neonBlue;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.shadowBlur = 0;
      });

      const spinners = Matter.Composite.allBodies(world).filter((b) => b.label === "spinner");
      spinners.forEach((sp) => {
        const x = sp.position.x;
        const y = sp.position.y;
        const w = 16;
        const h = 40;
        const spinAngle = animTimeRef.current * 0.08;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spinAngle);
        ctx.fillStyle = "rgba(255,200,0,0.4)";
        ctx.shadowColor = COLORS.gold;
        ctx.shadowBlur = 10;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
        ctx.shadowBlur = 0;
      });

      const now = Date.now();
      bumperDataRef.current.forEach((bd, i) => {
        const b = bd.body;
        const x = b.position.x;
        const y = b.position.y;
        const r = (b.bounds.max.x - b.bounds.min.x) / 2;
        const recentlyHit = now - bd.lastHit < 350;
        const bumpPulse = recentlyHit ? 1.2 : 0.9 + 0.1 * Math.sin(t + i);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.fill();
        const ringGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        ringGrad.addColorStop(0, COLORS.pink);
        ringGrad.addColorStop(0.6, COLORS.neonPurple);
        ringGrad.addColorStop(1, "#400060");
        ctx.fillStyle = ringGrad;
        ctx.shadowColor = COLORS.neonPurple;
        ctx.shadowBlur = 22 * bumpPulse;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = COLORS.pink;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.35, r * 0.2, -0.3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = jackpotMode ? COLORS.gold : COLORS.neonGreen;
      ctx.shadowColor = jackpotMode ? COLORS.gold : COLORS.neonGreen;
      ctx.shadowBlur = jackpotMode ? 35 : 25;
      const jx = jackpotZone.position.x - 42;
      const jy = jackpotZone.position.y - 16;
      const jw = 84;
      const jh = 32;
      const jr = 6;
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
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "bold 13px monospace";
      ctx.fillStyle = "#000";
      ctx.shadowBlur = 0;
      ctx.textAlign = "center";
      ctx.fillText("JACKPOT", jackpotZone.position.x, jackpotZone.position.y + 5);

      const flipperGrad = ctx.createLinearGradient(-flipperW / 2, 0, flipperW / 2, 0);
      flipperGrad.addColorStop(0, "#004050");
      flipperGrad.addColorStop(0.3, COLORS.neonBlue);
      flipperGrad.addColorStop(0.7, COLORS.neonBlue);
      flipperGrad.addColorStop(1, "#004050");
      ctx.save();
      ctx.translate(leftFlipper.position.x, leftFlipper.position.y);
      ctx.rotate(leftFlipper.angle);
      ctx.fillStyle = flipperGrad;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 14;
      ctx.fillRect(-flipperW / 2, -flipperH / 2, flipperW, flipperH);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(-flipperW / 2 + 4, -flipperH / 2 + 2, flipperW * 0.4, flipperH - 4);
      ctx.restore();
      ctx.save();
      ctx.translate(rightFlipper.position.x, rightFlipper.position.y);
      ctx.rotate(rightFlipper.angle);
      ctx.fillStyle = flipperGrad;
      ctx.shadowColor = COLORS.neonBlue;
      ctx.shadowBlur = 14;
      ctx.fillRect(-flipperW / 2, -flipperH / 2, flipperW, flipperH);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(flipperW / 2 - flipperW * 0.4 - 4, -flipperH / 2 + 2, flipperW * 0.4, flipperH - 4);
      ctx.restore();

      ballTrailRef.current.forEach((p, i) => {
        const alpha = (i + 1) / ballTrailRef.current.length;
        ctx.fillStyle = `rgba(57,255,20,${0.15 * alpha})`;
        ctx.shadowColor = COLORS.neonGreen;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      ballsRef.current.forEach((ballBody) => {
        const ballGrad = ctx.createRadialGradient(
          ballBody.position.x - 4,
          ballBody.position.y - 4,
          0,
          ballBody.position.x,
          ballBody.position.y,
          12
        );
        ballGrad.addColorStop(0, "#fff");
        ballGrad.addColorStop(0.4, COLORS.neonGreen);
        ballGrad.addColorStop(1, "#0a3d0a");
        ctx.fillStyle = ballGrad;
        ctx.shadowColor = COLORS.neonGreen;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(ballBody.position.x, ballBody.position.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
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
      className="relative w-full rounded-xl overflow-hidden bg-[#0a0a12] border-2 border-[#00f0ff]/50"
      style={{ boxShadow: "0 0 30px rgba(0,240,255,0.2)" }}
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
