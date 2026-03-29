"use client";

/**
 * HTML5 Canvas boxer (no WebGL). In App Router pages, prefer:
 * `dynamic(() => import("@/components/arena/Boxer2D"), { ssr: false })`
 * so the canvas only runs on the client.
 */
import { useEffect, useRef } from "react";

export type Boxer2DSkinTone = "light" | "medium" | "tan" | "dark" | "deep";
export type Boxer2DHairStyle =
  | "bald"
  | "fade"
  | "dreads"
  | "cornrows"
  | "afro"
  | "mohawk"
  | "buzz"
  | "long";
export type Boxer2DBodyType = "lightweight" | "middleweight" | "heavyweight";

const SKIN: Record<Boxer2DSkinTone, { base: string; mid: string; dark: string }> = {
  light: { base: "#FDDBB4", mid: "#F5C28A", dark: "#D4956A" },
  medium: { base: "#D4956A", mid: "#BB7A4F", dark: "#8B5E3C" },
  tan: { base: "#C68642", mid: "#A0692F", dark: "#7A4F1E" },
  dark: { base: "#8D5524", mid: "#6B3F19", dark: "#4A2C10" },
  deep: { base: "#4A2C10", mid: "#3A2008", dark: "#2A1505" },
};

const BODY_SCALE: Record<Boxer2DBodyType, number> = {
  lightweight: 0.88,
  middleweight: 1,
  heavyweight: 1.12,
};

const HEADGEAR_PURPLE = "#7C3AED";
const HEADGEAR_GOLD = "#F59E0B";
const SOCK_WHITE = "#F8FAFC";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function shadeHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const l = (x: number) => Math.round(Math.min(255, Math.max(0, x * factor)));
  return `rgb(${l(r)},${l(g)},${l(b)})`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

interface DrawOpts {
  skin: (typeof SKIN)[Boxer2DSkinTone];
  trunks: string;
  hairStyle: Boxer2DHairStyle;
  bodyScale: number;
  name: string;
  bob: number;
  w: number;
  h: number;
}

function drawBoxer(ctx: CanvasRenderingContext2D, opts: DrawOpts) {
  const { skin, trunks, hairStyle, bodyScale, name, bob, w, h } = opts;
  const gloveLight = shadeHex(trunks, 1.15);
  const gloveDark = shadeHex(trunks, 0.65);
  const trunkBand = shadeHex(trunks, 1.25);
  const shoeDark = "#1e293b";
  const shoeLight = "#334155";

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // Ground shadow
  const groundGrad = ctx.createRadialGradient(w * 0.5, h - 8 + bob, 2, w * 0.5, h - 8 + bob, w * 0.42);
  groundGrad.addColorStop(0, "rgba(0,0,0,0.28)");
  groundGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = groundGrad;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h - 6 + bob, w * 0.38, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  const cx = w * 0.5;
  const baseY = h - 28 + bob;
  const s = bodyScale * Math.min(w / 220, h / 340) * 0.92;

  ctx.translate(cx, baseY);
  ctx.scale(s, s);

  // --- Feet & legs (orthodox: left foot forward / screen-left) ---
  const footY = 0;
  // Right foot (rear, slightly out)
  ctx.save();
  ctx.translate(18, footY);
  ctx.rotate(-0.12);
  // Shoe
  const rShoe = ctx.createLinearGradient(-14, -6, 14, 8);
  rShoe.addColorStop(0, shoeLight);
  rShoe.addColorStop(0.5, shoeDark);
  rShoe.addColorStop(1, "#0f172a");
  drawRoundedRect(ctx, -22, -4, 44, 16, 6);
  ctx.fillStyle = rShoe;
  ctx.fill();
  // White sock
  const rSock = ctx.createLinearGradient(-8, -28, 8, -4);
  rSock.addColorStop(0, SOCK_WHITE);
  rSock.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = rSock;
  drawRoundedRect(ctx, -10, -32, 20, 30, 5);
  ctx.fill();
  // Calf
  const rCalf = ctx.createLinearGradient(-9, -95, 9, -32);
  rCalf.addColorStop(0, skin.mid);
  rCalf.addColorStop(0.45, skin.base);
  rCalf.addColorStop(1, skin.dark);
  ctx.fillStyle = rCalf;
  ctx.beginPath();
  ctx.ellipse(0, -62, 11, 38, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Left foot (lead, forward)
  ctx.save();
  ctx.translate(-32, footY - 4);
  ctx.rotate(0.08);
  const lShoe = ctx.createLinearGradient(-14, -6, 14, 8);
  lShoe.addColorStop(0, shoeLight);
  lShoe.addColorStop(0.55, shoeDark);
  lShoe.addColorStop(1, "#0f172a");
  drawRoundedRect(ctx, -22, -4, 46, 17, 6);
  ctx.fillStyle = lShoe;
  ctx.fill();
  const lSock = ctx.createLinearGradient(-8, -30, 8, -4);
  lSock.addColorStop(0, SOCK_WHITE);
  lSock.addColorStop(1, "#cbd5e1");
  ctx.fillStyle = lSock;
  drawRoundedRect(ctx, -10, -34, 20, 32, 5);
  ctx.fill();
  const lCalf = ctx.createLinearGradient(-9, -98, 9, -34);
  lCalf.addColorStop(0, skin.mid);
  lCalf.addColorStop(0.5, skin.base);
  lCalf.addColorStop(1, skin.dark);
  ctx.fillStyle = lCalf;
  ctx.beginPath();
  ctx.ellipse(0, -64, 12, 40, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Thighs / shorts lower
  ctx.save();
  ctx.translate(-6, -118);
  // Right thigh (behind)
  const rThigh = ctx.createRadialGradient(22, 10, 4, 22, 28, 40);
  rThigh.addColorStop(0, skin.base);
  rThigh.addColorStop(0.6, skin.mid);
  rThigh.addColorStop(1, skin.dark);
  ctx.fillStyle = rThigh;
  ctx.beginPath();
  ctx.ellipse(24, 32, 18, 52, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Left thigh
  const lThigh = ctx.createRadialGradient(-28, 12, 6, -26, 36, 48);
  lThigh.addColorStop(0, skin.base);
  lThigh.addColorStop(0.55, skin.mid);
  lThigh.addColorStop(1, skin.dark);
  ctx.fillStyle = lThigh;
  ctx.beginPath();
  ctx.ellipse(-26, 34, 20, 54, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Boxing shorts
  ctx.save();
  ctx.translate(0, -210);
  const shortsGrad = ctx.createLinearGradient(-55, 40, 55, 110);
  shortsGrad.addColorStop(0, shadeHex(trunks, 1.2));
  shortsGrad.addColorStop(0.35, trunks);
  shortsGrad.addColorStop(0.75, shadeHex(trunks, 0.75));
  shortsGrad.addColorStop(1, shadeHex(trunks, 0.55));
  ctx.fillStyle = shortsGrad;
  ctx.beginPath();
  ctx.moveTo(-52, 20);
  ctx.quadraticCurveTo(-58, 55, -48, 95);
  ctx.lineTo(-20, 108);
  ctx.lineTo(0, 100);
  ctx.lineTo(22, 108);
  ctx.quadraticCurveTo(58, 90, 52, 45);
  ctx.quadraticCurveTo(48, 15, 20, 8);
  ctx.lineTo(-18, 8);
  ctx.closePath();
  ctx.fill();
  // Waistband highlight
  const bandGrad = ctx.createLinearGradient(-54, 5, 54, 28);
  bandGrad.addColorStop(0, trunkBand);
  bandGrad.addColorStop(0.5, shadeHex(trunks, 0.95));
  bandGrad.addColorStop(1, shadeHex(trunks, 0.7));
  ctx.fillStyle = bandGrad;
  ctx.beginPath();
  ctx.moveTo(-50, 18);
  ctx.quadraticCurveTo(0, 2, 50, 18);
  ctx.lineTo(48, 32);
  ctx.quadraticCurveTo(0, 22, -48, 32);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Torso (forward lean ~8°)
  ctx.save();
  ctx.translate(4, -248);
  ctx.rotate(0.14);
  const torsoW = 72;
  const torsoH = 118;
  const pec = ctx.createRadialGradient(-15, -35, 8, 0, 10, 55);
  pec.addColorStop(0, skin.base);
  pec.addColorStop(0.4, skin.mid);
  pec.addColorStop(1, skin.dark);
  ctx.fillStyle = pec;
  ctx.beginPath();
  ctx.ellipse(0, 0, torsoW / 2, torsoH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Left pec shadow (definition)
  const pecL = ctx.createRadialGradient(-22, -28, 4, -22, -12, 28);
  pecL.addColorStop(0, "rgba(0,0,0,0.22)");
  pecL.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pecL;
  ctx.beginPath();
  ctx.ellipse(-18, -22, 22, 18, -0.2, 0, Math.PI * 2);
  ctx.fill();
  const pecR = ctx.createRadialGradient(18, -26, 4, 18, -10, 26);
  pecR.addColorStop(0, "rgba(0,0,0,0.18)");
  pecR.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pecR;
  ctx.beginPath();
  ctx.ellipse(16, -20, 20, 16, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Ab lines
  for (let i = 0; i < 3; i++) {
    const ab = ctx.createLinearGradient(-20, 18 + i * 14, 20, 28 + i * 14);
    ab.addColorStop(0, "rgba(0,0,0,0)");
    ab.addColorStop(0.5, "rgba(0,0,0,0.12)");
    ab.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ab;
    ctx.fillRect(-18, 22 + i * 16, 36, 3);
  }
  ctx.restore();

  // Rear arm (right) — tucked near chin
  ctx.save();
  ctx.translate(38, -318);
  ctx.rotate(-0.35);
  const uaR = ctx.createLinearGradient(-12, 0, 12, 70);
  uaR.addColorStop(0, skin.mid);
  uaR.addColorStop(0.5, skin.base);
  uaR.addColorStop(1, skin.dark);
  ctx.fillStyle = uaR;
  ctx.beginPath();
  ctx.ellipse(0, 38, 14, 44, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(4, 78);
  ctx.rotate(0.55);
  const faR = ctx.createLinearGradient(-10, 0, 10, 52);
  faR.addColorStop(0, skin.mid);
  faR.addColorStop(1, skin.dark);
  ctx.fillStyle = faR;
  ctx.beginPath();
  ctx.ellipse(0, 28, 11, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rear glove (compact)
  const gR = ctx.createRadialGradient(2, 8, 4, 2, 14, 28);
  gR.addColorStop(0, gloveLight);
  gR.addColorStop(0.55, trunks);
  gR.addColorStop(1, gloveDark);
  ctx.fillStyle = gR;
  ctx.beginPath();
  ctx.ellipse(0, 68, 22, 24, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Lead arm (left) — extended toward viewer/chin height
  ctx.save();
  ctx.translate(-42, -332);
  ctx.rotate(0.42);
  const uaL = ctx.createLinearGradient(-14, 0, 14, 72);
  uaL.addColorStop(0, skin.mid);
  uaL.addColorStop(0.45, skin.base);
  uaL.addColorStop(1, skin.dark);
  ctx.fillStyle = uaL;
  ctx.beginPath();
  ctx.ellipse(0, 42, 16, 48, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(-2, 88);
  ctx.rotate(-0.38);
  const faL = ctx.createLinearGradient(-10, 0, 12, 58);
  faL.addColorStop(0, skin.base);
  faL.addColorStop(1, skin.dark);
  ctx.fillStyle = faL;
  ctx.beginPath();
  ctx.ellipse(0, 32, 12, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  const gL = ctx.createRadialGradient(0, 10, 6, 0, 18, 34);
  gL.addColorStop(0, gloveLight);
  gL.addColorStop(0.5, trunks);
  gL.addColorStop(1, gloveDark);
  ctx.fillStyle = gL;
  ctx.beginPath();
  ctx.ellipse(4, 78, 26, 28, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke();
  ctx.restore();

  // Neck
  ctx.save();
  ctx.translate(6, -348);
  const neck = ctx.createLinearGradient(-14, 10, 14, 36);
  neck.addColorStop(0, skin.mid);
  neck.addColorStop(1, skin.dark);
  ctx.fillStyle = neck;
  ctx.beginPath();
  ctx.ellipse(0, 22, 18, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Head + face (under headgear)
  ctx.save();
  ctx.translate(8, -398);
  const faceGrad = ctx.createRadialGradient(-8, -10, 10, 4, 16, 48);
  faceGrad.addColorStop(0, skin.base);
  faceGrad.addColorStop(0.55, skin.mid);
  faceGrad.addColorStop(1, skin.dark);
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(0, 8, 34, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.ellipse(-12, 4, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(10, 2, 5, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const eyeShine = ctx.createRadialGradient(-12, 3, 0, -12, 4, 3);
  eyeShine.addColorStop(0, "rgba(255,255,255,0.9)");
  eyeShine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = eyeShine;
  ctx.beginPath();
  ctx.arc(-12, 3, 1.2, 0, Math.PI * 2);
  ctx.fill();
  const eyeShine2 = ctx.createRadialGradient(10, 1, 0, 10, 2, 3);
  eyeShine2.addColorStop(0, "rgba(255,255,255,0.85)");
  eyeShine2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = eyeShine2;
  ctx.beginPath();
  ctx.arc(10, 1, 1, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(2, 12);
  ctx.quadraticCurveTo(-2, 22, 0, 28);
  ctx.stroke();
  // Mouth
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.moveTo(-10, 34);
  ctx.quadraticCurveTo(0, 38, 10, 32);
  ctx.stroke();
  ctx.restore();

  // Headgear (purple + gold trim) — draw after face base, covers forehead/sides
  ctx.save();
  ctx.translate(8, -402);
  const hgMain = ctx.createLinearGradient(-40, -30, 40, 50);
  hgMain.addColorStop(0, shadeHex(HEADGEAR_PURPLE, 1.15));
  hgMain.addColorStop(0.45, HEADGEAR_PURPLE);
  hgMain.addColorStop(1, shadeHex(HEADGEAR_PURPLE, 0.65));
  ctx.fillStyle = hgMain;
  ctx.beginPath();
  ctx.arc(0, 0, 42, Math.PI * 1.05, Math.PI * 2.05);
  ctx.lineTo(38, 18);
  ctx.quadraticCurveTo(0, 42, -38, 18);
  ctx.closePath();
  ctx.fill();
  // Gold trim bands
  ctx.strokeStyle = HEADGEAR_GOLD;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -2, 38, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-36, 8);
  ctx.quadraticCurveTo(0, 28, 36, 8);
  ctx.stroke();
  ctx.strokeStyle = shadeHex(HEADGEAR_GOLD, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 2, 34, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();

  // Hair (on top of head, under/around headgear depending on style)
  ctx.save();
  ctx.translate(8, -428);
  drawHair(ctx, hairStyle, skin);
  ctx.restore();

  // Name plate
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const nameGrad = ctx.createLinearGradient(cx - 60, h - 36, cx + 60, h - 20);
  nameGrad.addColorStop(0, "rgba(15,23,42,0.5)");
  nameGrad.addColorStop(0.5, "rgba(30,27,75,0.65)");
  nameGrad.addColorStop(1, "rgba(15,23,42,0.5)");
  ctx.fillStyle = nameGrad;
  drawRoundedRect(ctx, cx - 70, h - 38, 140, 22, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(245,158,11,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(name.slice(0, 22), cx, h - 22);
  ctx.restore();

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  style: Boxer2DHairStyle,
  skin: { base: string; mid: string; dark: string }
) {
  const hairDark = shadeHex("#1c1917", 0.9);
  const hairMid = "#3f3f46";

  switch (style) {
    case "bald":
      return;
    case "buzz": {
      const g = ctx.createRadialGradient(0, 8, 4, 0, 12, 38);
      g.addColorStop(0, hairMid);
      g.addColorStop(1, hairDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 12, 34, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "fade": {
      const g = ctx.createLinearGradient(0, -10, 0, 35);
      g.addColorStop(0, hairMid);
      g.addColorStop(0.6, hairDark);
      g.addColorStop(1, skin.dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 10, 36, Math.PI * 1.05, Math.PI * 1.95);
      ctx.lineTo(32, 28);
      ctx.quadraticCurveTo(0, 40, -32, 28);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "afro": {
      const g = ctx.createRadialGradient(-5, 0, 10, 0, 8, 48);
      g.addColorStop(0, "#52525b");
      g.addColorStop(0.7, "#27272a");
      g.addColorStop(1, "#18181b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 4, 46, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "mohawk": {
      const g = ctx.createLinearGradient(-6, -25, 6, 20);
      g.addColorStop(0, "#71717a");
      g.addColorStop(1, hairDark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-10, 18);
      ctx.lineTo(-6, -28);
      ctx.lineTo(6, -28);
      ctx.lineTo(10, 18);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "dreads": {
      ctx.strokeStyle = hairDark;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 4, 8);
        ctx.quadraticCurveTo(i * 5, 35 + Math.abs(i) * 3, i * 3, 58 + i * 2);
        ctx.stroke();
      }
      break;
    }
    case "cornrows": {
      ctx.strokeStyle = hairDark;
      ctx.lineWidth = 2;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 3.5, -5);
        ctx.lineTo(i * 2.5, 28);
        ctx.stroke();
      }
      break;
    }
    case "long": {
      const g = ctx.createLinearGradient(-20, 0, 20, 80);
      g.addColorStop(0, "#44403c");
      g.addColorStop(1, "#1c1917");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-28, 20);
      ctx.quadraticCurveTo(-40, 55, -32, 95);
      ctx.lineTo(32, 95);
      ctx.quadraticCurveTo(40, 55, 28, 20);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

export interface Boxer2DProps {
  skinTone: Boxer2DSkinTone;
  trunksColor: string;
  hairStyle: Boxer2DHairStyle;
  bodyType: Boxer2DBodyType;
  name: string;
  animate?: boolean;
  width?: number;
  height?: number;
}

export default function Boxer2D({
  skinTone,
  trunksColor,
  hairStyle,
  bodyType,
  name,
  animate = true,
  width = 220,
  height = 340,
}: Boxer2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const skin = SKIN[skinTone];
    const bodyScale = BODY_SCALE[bodyType];

    const tick = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = (t - startRef.current) / 1000;
      const bob = animate ? Math.sin(elapsed * 1.25) * 2 : 0;
      drawBoxer(ctx, {
        skin,
        trunks: trunksColor,
        hairStyle,
        bodyScale,
        name,
        bob,
        w: width,
        h: height,
      });
      if (animate) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (animate) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      drawBoxer(ctx, {
        skin,
        trunks: trunksColor,
        hairStyle,
        bodyScale,
        name,
        bob: 0,
        w: width,
        h: height,
      });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = 0;
    };
  }, [skinTone, trunksColor, hairStyle, bodyType, name, animate, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden
      className="block max-w-full select-none"
      style={{ imageRendering: "auto" }}
    />
  );
}
