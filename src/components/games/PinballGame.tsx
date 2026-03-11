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
const COMBO_DECAY_MS = 800;

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

  const playSound = useCallback((type: "bumper" | "jackpot" | "flipper" | "drain") => {
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

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1 } });
    engineRef.current = engine;
    const { world } = engine;

    const wallOpts: Matter.IChamferableBodyDefinition = { isStatic: true, restitution: 0.6, friction: 0 };
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
      friction: 0.8,
      restitution: 0.9,
    } as Matter.IChamferableBodyDefinition);
    const rightFlipper = Matter.Bodies.rectangle(280, flipperY, flipperW, flipperH, {
      isStatic: true,
      angle: -0.35,
      friction: 0.8,
      restitution: 0.9,
    } as Matter.IChamferableBodyDefinition);
    Matter.World.add(world, [leftFlipper, rightFlipper]);
    leftFlipperRef.current = leftFlipper;
    rightFlipperRef.current = rightFlipper;

    const bumperOpts: Matter.IBodyDefinition = { isStatic: true, restitution: 1.2, friction: 0, label: "bumper" };
    const bumpers = [
      Matter.Bodies.circle(200, 180, 28, bumperOpts),
      Matter.Bodies.circle(120, 280, 24, bumperOpts),
      Matter.Bodies.circle(280, 280, 24, bumperOpts),
      Matter.Bodies.circle(160, 380, 22, bumperOpts),
      Matter.Bodies.circle(240, 380, 22, bumperOpts),
    ];
    bumpers.forEach((b) => ((b as Matter.Body & { label?: string }).label = "bumper"));
    Matter.World.add(world, bumpers);

    const jackpotZone = Matter.Bodies.rectangle(200, 80, 80, 30, {
      isStatic: true,
      isSensor: true,
      label: "jackpot",
    } as Matter.IChamferableBodyDefinition);
    Matter.World.add(world, jackpotZone);

    const ball = Matter.Bodies.circle(200, 300, 10, {
      restitution: 0.8,
      friction: 0.001,
      density: 0.004,
      label: "ball",
    });
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    Matter.World.add(world, ball);
    ballRef.current = ball;

    Matter.Events.on(engine, "collisionStart", (event) => {
      const pairs = event.pairs;
      for (const p of pairs) {
        const a = p.bodyA;
        const b = p.bodyB;
        const now = Date.now();
        if (now - lastComboTimeRef.current > COMBO_DECAY_MS) comboRef.current = 0;
        lastComboTimeRef.current = now;
        if ((a.label === "bumper" || b.label === "bumper") && (a.label === "ball" || b.label === "ball")) {
          comboRef.current += 1;
          const mult = Math.min(comboRef.current, 5);
          const add = BUMPER_SCORE * mult;
          scoreRef.current += add;
          setScore(scoreRef.current);
          setCombo(comboRef.current);
          playSound("bumper");
          const bumperBody = a.label === "bumper" ? a : b;
          const ballBody = a.label === "ball" ? a : b;
          for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
            particlesRef.current.push({
              x: bumperBody.position.x,
              y: bumperBody.position.y,
              vx: Math.cos(angle) * 4,
              vy: Math.sin(angle) * 4,
              life: 1,
              hue: 280,
            });
          }
        }
        if ((a.label === "jackpot" || b.label === "jackpot") && (a.label === "ball" || b.label === "ball")) {
          scoreRef.current += JACKPOT_SCORE;
          setScore(scoreRef.current);
          setJackpotMode(true);
          playSound("jackpot");
          setTimeout(() => setJackpotMode(false), 1500);
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
      const pulse = 0.85 + 0.15 * Math.sin(t);

      ballTrailRef.current.push({ x: ball.position.x, y: ball.position.y });
      if (ballTrailRef.current.length > 14) ballTrailRef.current.shift();

      particlesRef.current = particlesRef.current
        .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.028 }))
        .filter((p) => p.life > 0);

      const by = ball.position.y;
      if (by > 620) {
        gameEndedRef.current = true;
        playSound("drain");
        setGameOver(true);
        onGameEnd(scoreRef.current);
        Matter.Engine.clear(engine);
        engineRef.current = null;
        ballRef.current = null;
        leftFlipperRef.current = null;
        rightFlipperRef.current = null;
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pad = 8;
      const tableW = 400;
      const tableH = 600;
      const backglassH = 52;
      const playfieldY = backglassH;

      ctx.fillStyle = COLORS.cabinet;
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.translate(ox, oy);
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
      ctx.fillText(`SCORE: ${scoreRef.current}`, 16, 36);
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

      bumpers.forEach((b, i) => {
        const x = b.position.x;
        const y = b.position.y;
        const r = (b.bounds.max.x - b.bounds.min.x) / 2;
        const bumpPulse = 0.9 + 0.1 * Math.sin(t + i);
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

      const ballGrad = ctx.createRadialGradient(
        ball.position.x - 4,
        ball.position.y - 4,
        0,
        ball.position.x,
        ball.position.y,
        12
      );
      ballGrad.addColorStop(0, "#fff");
      ballGrad.addColorStop(0.4, COLORS.neonGreen);
      ballGrad.addColorStop(1, "#0a3d0a");
      ctx.fillStyle = ballGrad;
      ctx.shadowColor = COLORS.neonGreen;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();

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
      <canvas
        ref={canvasRef}
        className="w-full touch-none"
        style={{ height: "min(600px, 85vh)", display: "block" }}
        width={400}
        height={600}
      />
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
