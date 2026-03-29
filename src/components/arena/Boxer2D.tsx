"use client";

import { useEffect, useRef } from "react";

type SkinTone = "light" | "medium" | "tan" | "dark" | "deep";
type HairStyle = "bald" | "fade" | "dreads" | "cornrows" | "afro" | "mohawk" | "buzz" | "long";
type BodyType = "lightweight" | "middleweight" | "heavyweight";

interface Boxer2DProps {
  skinTone: SkinTone;
  trunksColor: string;
  hairStyle: HairStyle;
  bodyType: BodyType;
  name: string;
  animate?: boolean;
  width?: number;
  height?: number;
}

interface ToneSet {
  base: string;
  mid: string;
  dark: string;
}

interface Point {
  x: number;
  y: number;
}

const SKIN_PALETTE: Record<SkinTone, ToneSet> = {
  light: { base: "#FDDBB4", mid: "#F5C28A", dark: "#D4956A" },
  medium: { base: "#D4956A", mid: "#BB7A4F", dark: "#8B5E3C" },
  tan: { base: "#C68642", mid: "#A0692F", dark: "#7A4F1E" },
  dark: { base: "#8D5524", mid: "#6B3F19", dark: "#4A2C10" },
  deep: { base: "#4A2C10", mid: "#3A2008", dark: "#2A1505" },
};

const BODY_SCALE: Record<BodyType, number> = {
  lightweight: 0.88,
  middleweight: 1.0,
  heavyweight: 1.12,
};

const HEADGEAR_PURPLE = "#7C3AED";
const HEADGEAR_GOLD = "#F59E0B";
const SOCK_WHITE = "#F8FAFC";

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function normalizeHex(input: string, fallback: string): string {
  const raw = (input || "").trim();
  const short = /^#([0-9a-fA-F]{3})$/;
  const full = /^#([0-9a-fA-F]{6})$/;
  if (full.test(raw)) return raw;
  const shortMatch = raw.match(short);
  if (shortMatch) {
    const [, g] = shortMatch;
    return `#${g[0]}${g[0]}${g[1]}${g[1]}${g[2]}${g[2]}`;
  }
  return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = normalizeHex(hex, "#808080").slice(1);
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(hexA: string, hexB: string, amount: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = clamp(amount, 0, 1);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function drawSoftEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  colorInner: string,
  colorOuter: string
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, colorInner);
  g.addColorStop(1, colorOuter);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  radius: number,
  tone: ToneSet
): void {
  const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  grad.addColorStop(0, tone.base);
  grad.addColorStop(0.55, tone.mid);
  grad.addColorStop(1, tone.dark);
  ctx.lineCap = "round";
  ctx.strokeStyle = grad;
  ctx.lineWidth = radius * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const hg = ctx.createLinearGradient(a.x - nx * radius, a.y - ny * radius, b.x - nx * radius, b.y - ny * radius);
  hg.addColorStop(0, "rgba(255,255,255,0.24)");
  hg.addColorStop(0.6, "rgba(255,255,255,0.08)");
  hg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = hg;
  ctx.lineWidth = radius * 0.65;
  ctx.beginPath();
  ctx.moveTo(a.x - nx * radius * 0.32, a.y - ny * radius * 0.32);
  ctx.lineTo(b.x - nx * radius * 0.32, b.y - ny * radius * 0.32);
  ctx.stroke();
}

function drawShoe(
  ctx: CanvasRenderingContext2D,
  center: Point,
  width: number,
  height: number,
  direction: "left" | "right"
): void {
  const heel = direction === "left" ? center.x + width * 0.35 : center.x - width * 0.35;
  const toe = direction === "left" ? center.x - width * 0.7 : center.x + width * 0.7;
  const grad = ctx.createLinearGradient(heel, center.y, toe, center.y + height);
  grad.addColorStop(0, "#171B22");
  grad.addColorStop(0.55, "#262D39");
  grad.addColorStop(1, "#0B0F15");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(heel, center.y - height * 0.38);
  ctx.quadraticCurveTo(center.x, center.y - height * 0.85, toe, center.y - height * 0.2);
  ctx.quadraticCurveTo(toe + (direction === "left" ? -2 : 2), center.y + height * 0.35, center.x, center.y + height * 0.42);
  ctx.quadraticCurveTo(heel, center.y + height * 0.4, heel, center.y - height * 0.38);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(heel * 0.7 + center.x * 0.3, center.y - height * 0.12);
  ctx.quadraticCurveTo(center.x, center.y - height * 0.42, toe * 0.86 + center.x * 0.14, center.y - height * 0.04);
  ctx.stroke();
}

function drawHair(ctx: CanvasRenderingContext2D, style: HairStyle): void {
  if (style === "bald") return;

  const root = "#18130F";
  const mid = "#241B15";
  const shine = "rgba(255,255,255,0.08)";

  const topY = 46;
  ctx.save();

  if (style === "afro") {
    drawSoftEllipse(ctx, -3, topY + 8, 34, 26, mid, "rgba(0,0,0,0)");
    drawSoftEllipse(ctx, -3, topY + 7, 27, 19, root, "rgba(0,0,0,0)");
  } else if (style === "mohawk") {
    const g = ctx.createLinearGradient(-6, topY - 6, 4, topY + 25);
    g.addColorStop(0, mid);
    g.addColorStop(1, root);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8, topY + 24);
    ctx.quadraticCurveTo(-1, topY - 8, 6, topY + 24);
    ctx.lineTo(-3, topY + 27);
    ctx.closePath();
    ctx.fill();
  } else if (style === "long") {
    const g = ctx.createLinearGradient(-22, topY - 2, 20, topY + 32);
    g.addColorStop(0, mid);
    g.addColorStop(1, root);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-26, topY + 3);
    ctx.quadraticCurveTo(-34, topY + 26, -20, topY + 44);
    ctx.quadraticCurveTo(-5, topY + 40, 4, topY + 43);
    ctx.quadraticCurveTo(24, topY + 38, 24, topY + 10);
    ctx.quadraticCurveTo(5, topY - 9, -26, topY + 3);
    ctx.fill();
  } else if (style === "dreads") {
    ctx.fillStyle = root;
    for (let i = -19; i <= 19; i += 6) {
      ctx.beginPath();
      ctx.ellipse(i * 0.7, topY + 14 + Math.abs(i) * 0.08, 2.7, 10.8, 0.12 * (i / 20), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === "cornrows") {
    ctx.strokeStyle = root;
    ctx.lineWidth = 1.8;
    for (let i = -18; i <= 18; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, topY + 20);
      ctx.quadraticCurveTo(i * 0.7, topY + 5, i * 0.4, topY - 2);
      ctx.stroke();
    }
  } else if (style === "fade" || style === "buzz") {
    const g = ctx.createRadialGradient(-3, topY + 12, 4, -3, topY + 12, 26);
    g.addColorStop(0, mid);
    g.addColorStop(1, root);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-3, topY + 13, 24, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = shine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-3, topY + 9, 18, Math.PI * 1.02, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();
}

function drawBoxer(
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    skinTone,
    trunksColor,
    hairStyle,
    bodyType,
    name,
    bobOffset,
  }: {
    width: number;
    height: number;
    skinTone: SkinTone;
    trunksColor: string;
    hairStyle: HairStyle;
    bodyType: BodyType;
    name: string;
    bobOffset: number;
  }
): void {
  ctx.clearRect(0, 0, width, height);

  const tone = SKIN_PALETTE[skinTone];
  const bodyScale = BODY_SCALE[bodyType];
  const fitScale = Math.min(width / 220, height / 340);
  const s = fitScale * bodyScale;

  const trunksBase = normalizeHex(trunksColor, "#2563EB");
  const trunksLight = mixHex(trunksBase, "#FFFFFF", 0.25);
  const trunksDark = mixHex(trunksBase, "#000000", 0.32);
  const gloveMid = mixHex(trunksBase, "#000000", 0.2);

  ctx.save();
  ctx.translate(width / 2, 6 + bobOffset);
  ctx.scale(s, s);

  const groundY = 313;
  const pelvisY = 194;

  drawSoftEllipse(ctx, 0, groundY + 3, 58, 12, "rgba(0,0,0,0.33)", "rgba(0,0,0,0)");

  // Rear leg (right side) in stance.
  const rearHip: Point = { x: 18, y: pelvisY };
  const rearKnee: Point = { x: 20, y: 248 };
  const rearAnkle: Point = { x: 22, y: 288 };
  drawSegment(ctx, rearHip, rearKnee, 12.5, tone);
  drawSegment(ctx, rearKnee, rearAnkle, 10.5, tone);
  drawSoftEllipse(ctx, rearKnee.x - 0.5, rearKnee.y + 0.5, 7.4, 5.8, withAlpha(tone.mid, 0.48), "rgba(0,0,0,0)");

  // Lead leg (left side), slightly advanced.
  const leadHip: Point = { x: -22, y: pelvisY };
  const leadKnee: Point = { x: -33, y: 246 };
  const leadAnkle: Point = { x: -41, y: 286 };
  drawSegment(ctx, leadHip, leadKnee, 13, tone);
  drawSegment(ctx, leadKnee, leadAnkle, 11, tone);
  drawSoftEllipse(ctx, leadKnee.x - 1, leadKnee.y + 1, 8, 6, withAlpha(tone.mid, 0.48), "rgba(0,0,0,0)");

  // Socks.
  const sockLeft = ctx.createLinearGradient(leadAnkle.x, leadAnkle.y - 8, leadAnkle.x, leadAnkle.y + 9);
  sockLeft.addColorStop(0, "#FFFFFF");
  sockLeft.addColorStop(1, "#DCE5EE");
  ctx.fillStyle = sockLeft;
  ctx.beginPath();
  ctx.ellipse(leadAnkle.x, leadAnkle.y + 1, 11, 7, -0.1, 0, Math.PI * 2);
  ctx.fill();

  const sockRight = ctx.createLinearGradient(rearAnkle.x, rearAnkle.y - 8, rearAnkle.x, rearAnkle.y + 9);
  sockRight.addColorStop(0, "#FFFFFF");
  sockRight.addColorStop(1, "#DCE5EE");
  ctx.fillStyle = sockRight;
  ctx.beginPath();
  ctx.ellipse(rearAnkle.x, rearAnkle.y + 1, 10.5, 6.8, 0.06, 0, Math.PI * 2);
  ctx.fill();

  drawShoe(ctx, { x: -42, y: 300 }, 29, 16, "left");
  drawShoe(ctx, { x: 24, y: 300 }, 27, 15, "right");

  // Boxing trunks.
  const trunksGrad = ctx.createLinearGradient(0, 190, 0, 228);
  trunksGrad.addColorStop(0, trunksLight);
  trunksGrad.addColorStop(0.35, trunksBase);
  trunksGrad.addColorStop(1, trunksDark);

  ctx.fillStyle = trunksGrad;
  ctx.beginPath();
  ctx.moveTo(-39, 190);
  ctx.quadraticCurveTo(0, 182, 39, 190);
  ctx.lineTo(45, 222);
  ctx.quadraticCurveTo(0, 236, -45, 222);
  ctx.closePath();
  ctx.fill();

  const waistGrad = ctx.createLinearGradient(0, 182, 0, 197);
  waistGrad.addColorStop(0, mixHex(trunksLight, "#FFFFFF", 0.3));
  waistGrad.addColorStop(1, mixHex(trunksBase, "#000000", 0.22));
  ctx.fillStyle = waistGrad;
  ctx.beginPath();
  ctx.moveTo(-41, 186);
  ctx.quadraticCurveTo(0, 177, 41, 186);
  ctx.quadraticCurveTo(0, 195, -41, 186);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 186, 40, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.stroke();

  // Forward lean for torso, head, and arms.
  ctx.save();
  ctx.translate(0, pelvisY);
  ctx.rotate(-0.08);
  ctx.translate(0, -pelvisY);

  // Torso with realistic muscle shading.
  const torsoPath = new Path2D();
  torsoPath.moveTo(-44, 123);
  torsoPath.quadraticCurveTo(-49, 152, -32, 188);
  torsoPath.quadraticCurveTo(0, 203, 32, 188);
  torsoPath.quadraticCurveTo(50, 152, 44, 123);
  torsoPath.quadraticCurveTo(28, 112, 0, 113);
  torsoPath.quadraticCurveTo(-28, 112, -44, 123);

  const torsoGrad = ctx.createLinearGradient(0, 114, 0, 194);
  torsoGrad.addColorStop(0, mixHex(tone.base, "#FFFFFF", 0.1));
  torsoGrad.addColorStop(0.43, tone.mid);
  torsoGrad.addColorStop(1, tone.dark);
  ctx.fillStyle = torsoGrad;
  ctx.fill(torsoPath);

  drawSoftEllipse(ctx, -16, 140, 18, 12, withAlpha(tone.dark, 0.42), "rgba(0,0,0,0)");
  drawSoftEllipse(ctx, 16, 140, 18, 12, withAlpha(tone.dark, 0.42), "rgba(0,0,0,0)");
  drawSoftEllipse(ctx, 0, 128, 30, 16, "rgba(255,255,255,0.16)", "rgba(255,255,255,0)");

  const abCenterGrad = ctx.createLinearGradient(0, 146, 0, 194);
  abCenterGrad.addColorStop(0, "rgba(0,0,0,0)");
  abCenterGrad.addColorStop(0.45, withAlpha(tone.dark, 0.28));
  abCenterGrad.addColorStop(1, withAlpha(tone.dark, 0.4));
  ctx.strokeStyle = abCenterGrad;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(0, 148);
  ctx.quadraticCurveTo(-1, 168, 0, 189);
  ctx.stroke();

  for (const y of [156, 168, 181]) {
    const g = ctx.createLinearGradient(-18, y, 18, y);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, withAlpha(tone.dark, 0.27));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-17, y);
    ctx.quadraticCurveTo(0, y + 2.5, 17, y);
    ctx.stroke();
  }

  // Neck.
  const neckGrad = ctx.createLinearGradient(0, 106, 0, 123);
  neckGrad.addColorStop(0, tone.base);
  neckGrad.addColorStop(1, tone.dark);
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.moveTo(-10, 106);
  ctx.quadraticCurveTo(-12, 116, -8, 123);
  ctx.lineTo(8, 123);
  ctx.quadraticCurveTo(12, 116, 10, 106);
  ctx.closePath();
  ctx.fill();

  // Head and face.
  const headGrad = ctx.createRadialGradient(-6, 62, 10, -2, 76, 40);
  headGrad.addColorStop(0, mixHex(tone.base, "#FFFFFF", 0.14));
  headGrad.addColorStop(0.58, tone.mid);
  headGrad.addColorStop(1, tone.dark);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(-3, 78, 28, 33, -0.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = withAlpha(tone.dark, 0.46);
  ctx.beginPath();
  ctx.ellipse(-31, 79, 3.7, 7, -0.08, 0, Math.PI * 2);
  ctx.ellipse(25, 79, 3.4, 6.7, 0.08, 0, Math.PI * 2);
  ctx.fill();

  drawHair(ctx, hairStyle);

  // Headgear shell.
  const gearGrad = ctx.createLinearGradient(0, 40, 0, 120);
  gearGrad.addColorStop(0, mixHex(HEADGEAR_PURPLE, "#FFFFFF", 0.18));
  gearGrad.addColorStop(0.55, HEADGEAR_PURPLE);
  gearGrad.addColorStop(1, mixHex(HEADGEAR_PURPLE, "#000000", 0.35));

  ctx.fillStyle = gearGrad;
  ctx.beginPath();
  ctx.ellipse(-3, 77, 34, 38, 0, Math.PI * 0.92, Math.PI * 2.06);
  ctx.ellipse(-3, 62, 26, 20, 0, Math.PI * 1.06, Math.PI * 1.92, true);
  ctx.closePath();
  ctx.fill();

  const cheekGuardGrad = ctx.createLinearGradient(-33, 68, -24, 112);
  cheekGuardGrad.addColorStop(0, mixHex(HEADGEAR_PURPLE, "#FFFFFF", 0.15));
  cheekGuardGrad.addColorStop(1, mixHex(HEADGEAR_PURPLE, "#000000", 0.35));
  ctx.fillStyle = cheekGuardGrad;
  ctx.beginPath();
  ctx.moveTo(-35, 68);
  ctx.quadraticCurveTo(-45, 91, -33, 110);
  ctx.quadraticCurveTo(-23, 112, -21, 92);
  ctx.quadraticCurveTo(-22, 77, -35, 68);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(29, 68);
  ctx.quadraticCurveTo(40, 91, 28, 110);
  ctx.quadraticCurveTo(18, 112, 16, 92);
  ctx.quadraticCurveTo(17, 77, 29, 68);
  ctx.fill();

  ctx.strokeStyle = HEADGEAR_GOLD;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(-3, 62, 23, 16, 0, Math.PI * 1.04, Math.PI * 1.96);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-30, 56);
  ctx.quadraticCurveTo(-3, 45, 25, 56);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-31, 87);
  ctx.lineTo(-25, 103);
  ctx.moveTo(26, 87);
  ctx.lineTo(20, 103);
  ctx.stroke();

  // Face features.
  ctx.fillStyle = "#101418";
  ctx.beginPath();
  ctx.ellipse(-13, 76, 3.4, 2.2, 0.1, 0, Math.PI * 2);
  ctx.ellipse(8, 76, 3.1, 2.1, -0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = withAlpha(tone.dark, 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-16, 70);
  ctx.quadraticCurveTo(-12, 68, -8, 70);
  ctx.moveTo(5, 70);
  ctx.quadraticCurveTo(9, 68, 12, 70);
  ctx.stroke();

  const noseGrad = ctx.createLinearGradient(-3, 80, -3, 93);
  noseGrad.addColorStop(0, withAlpha(tone.mid, 0.95));
  noseGrad.addColorStop(1, withAlpha(tone.dark, 0.95));
  ctx.strokeStyle = noseGrad;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-3, 79);
  ctx.quadraticCurveTo(-4, 86, -2, 92);
  ctx.stroke();

  ctx.strokeStyle = withAlpha("#2A1611", 0.9);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-10, 96);
  ctx.quadraticCurveTo(-2, 100, 7, 95);
  ctx.stroke();

  // Arms: orthodox guard with lead (left) hand raised and extended.
  const leftShoulder: Point = { x: -34, y: 130 };
  const leftElbow: Point = { x: -54, y: 120 };
  const leftWrist: Point = { x: -69, y: 108 };
  const rightShoulder: Point = { x: 34, y: 132 };
  const rightElbow: Point = { x: 26, y: 122 };
  const rightWrist: Point = { x: 22, y: 111 };
  drawSegment(ctx, rightShoulder, rightElbow, 10.5, tone);
  drawSegment(ctx, rightElbow, rightWrist, 9.2, tone);
  drawSegment(ctx, leftShoulder, leftElbow, 11.4, tone);
  drawSegment(ctx, leftElbow, leftWrist, 9.9, tone);

  const gloveShade = ctx.createRadialGradient(0, 0, 1, 0, 0, 24);
  gloveShade.addColorStop(0, trunksLight);
  gloveShade.addColorStop(0.4, trunksBase);
  gloveShade.addColorStop(1, gloveMid);

  // Rear hand tucked near chin.
  ctx.save();
  ctx.translate(30, 106);
  ctx.rotate(0.22);
  ctx.fillStyle = gloveShade;
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 12, 0.15, 0, Math.PI * 2);
  ctx.ellipse(6, -2, 7, 6, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#FFFFFF", 0.22);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(-2, -2, 7, Math.PI * 1.02, Math.PI * 1.82);
  ctx.stroke();
  ctx.restore();

  // Lead hand at chin height, slightly extended.
  ctx.save();
  ctx.translate(-78, 102);
  ctx.rotate(-0.18);
  const leadGlove = ctx.createRadialGradient(-2, -3, 2, 0, 0, 26);
  leadGlove.addColorStop(0, trunksLight);
  leadGlove.addColorStop(0.45, trunksBase);
  leadGlove.addColorStop(1, gloveMid);
  ctx.fillStyle = leadGlove;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16.5, 13.5, 0.02, 0, Math.PI * 2);
  ctx.ellipse(8, -1, 7.5, 6.5, 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha("#FFFFFF", 0.24);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-2, -1, 8, Math.PI * 1.05, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // Name patch on waistband.
  const patch = ctx.createLinearGradient(-24, 190, -24, 201);
  patch.addColorStop(0, "rgba(255,255,255,0.95)");
  patch.addColorStop(1, "rgba(215,223,233,0.95)");
  ctx.fillStyle = patch;
  ctx.beginPath();
  ctx.moveTo(-24, 190);
  ctx.lineTo(24, 190);
  ctx.lineTo(22, 201);
  ctx.lineTo(-22, 201);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.font = "700 8px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const trimmed = name.trim().toUpperCase().slice(0, 14) || "BOXER";
  ctx.fillText(trimmed, 0, 196);

  ctx.restore();
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let startTime = 0;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const render = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const t = (timestamp - startTime) / 1000;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const bobOffset = animate ? Math.sin(t * 1.7) * 2 : 0;
      drawBoxer(ctx, {
        width,
        height,
        skinTone,
        trunksColor,
        hairStyle,
        bodyType,
        name,
        bobOffset,
      });

      if (animate) {
        raf = window.requestAnimationFrame(render);
      }
    };

    if (animate) {
      raf = window.requestAnimationFrame(render);
    } else {
      render(performance.now());
    }

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [animate, bodyType, hairStyle, height, name, skinTone, trunksColor, width]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-label={`${name} boxer portrait`}
      role="img"
      style={{ display: "block", width, height }}
    />
  );
}
