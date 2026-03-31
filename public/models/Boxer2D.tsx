"use client";

import { useEffect, useRef } from "react";

type SkinKey = "light" | "medium" | "tan" | "dark" | "deep";
type HairStyle = "bald" | "fade" | "dreads" | "cornrows" | "afro" | "mohawk" | "buzz" | "long" | "ponytail";
type BodyType = "lightweight" | "middleweight" | "heavyweight";
type Gender = "male" | "female";

interface Boxer2DProps {
  skinTone?: SkinKey;
  trunksColor?: string;
  hairStyle?: HairStyle;
  bodyType?: BodyType;
  gender?: Gender;
  name?: string;
  animate?: boolean;
  width?: number;
  height?: number;
}

const SKIN_PALETTE: Record<SkinKey, { base: string; mid: string; dark: string; lip: string }> = {
  light:  { base: "#FDDBB4", mid: "#F0C090", dark: "#D4956A", lip: "#C07060" },
  medium: { base: "#D4956A", mid: "#BB7A4F", dark: "#8B5E3C", lip: "#A0604A" },
  tan:    { base: "#C68642", mid: "#A0692F", dark: "#7A4F1E", lip: "#8A4A30" },
  dark:   { base: "#8D5524", mid: "#6B3F19", dark: "#4A2C10", lip: "#5A2F1A" },
  deep:   { base: "#4A2C10", mid: "#3A2008", dark: "#2A1505", lip: "#3A1A0A" },
};

function hex(h: string, a: number) {
  const n = parseInt(h.replace("#", ""), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawBoxer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  cfg: Required<Omit<Boxer2DProps, "animate" | "width" | "height">>,
  bob: number
) {
  const skin = SKIN_PALETTE[cfg.skinTone];
  const sc = cfg.bodyType === "lightweight" ? 0.88 : cfg.bodyType === "heavyweight" ? 1.12 : 1.0;
  const tc = cfg.trunksColor;

  // All measurements in pixels at scale=1, centered on cx
  // Ground = groundY, everything goes UP from there

  const S = (v: number) => v * sc;

  // ── proportions (feet at groundY, head top ~groundY - 310*sc) ──
  const footY     = groundY + bob * 0.2;
  const ankleY    = footY   - S(18);
  const kneeY     = ankleY  - S(80);
  const hipY      = kneeY   - S(82);
  const waistY    = hipY    - S(28);
  const chestY    = waistY  - S(60);
  const shoulderY = chestY  - S(18);
  const neckY     = shoulderY - S(8);
  const chinY     = neckY   - S(14);
  const headCY    = chinY   - S(28);   // head center
  const headTopY  = headCY  - S(32);

  const shoulderW = S(cfg.gender === "female" ? 44 : 52);
  const hipW      = S(cfg.gender === "female" ? 38 : 42);
  const waistW    = S(cfg.gender === "female" ? 28 : 32);
  const thighW    = S(18);
  const shinW     = S(13);

  // ── SHADOW ──
  const shad = ctx.createRadialGradient(cx, footY + 6, 2, cx, footY + 6, S(40));
  shad.addColorStop(0, "rgba(0,0,0,0.45)");
  shad.addColorStop(1, "transparent");
  ctx.fillStyle = shad;
  ctx.beginPath();
  ctx.ellipse(cx, footY + 6, S(40), S(10), 0, 0, Math.PI * 2);
  ctx.fill();

  // ── SHOES ──
  const shoeY = footY - S(6);
  ([-1, 1] as const).forEach((side) => {
    const fx = cx + side * S(13);
    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.ellipse(fx, shoeY, S(14), S(8), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.ellipse(fx - S(3), shoeY - S(3), S(5), S(3), -0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── SOCKS ──
  ([-1, 1] as const).forEach((side) => {
    const fx = cx + side * S(13);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(fx - S(9), ankleY - S(4), S(18), S(16));
    ctx.fillStyle = tc;
    ctx.fillRect(fx - S(9), ankleY - S(4), S(18), S(4));
  });

  // ── SHINS ──
  ([-1, 1] as const).forEach((side) => {
    const fx = cx + side * S(13);
    const g = ctx.createLinearGradient(fx - shinW, 0, fx + shinW, 0);
    g.addColorStop(0, skin.dark);
    g.addColorStop(0.35, skin.mid);
    g.addColorStop(0.65, skin.base);
    g.addColorStop(1, skin.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - shinW, ankleY);
    ctx.quadraticCurveTo(fx - shinW - S(2), (ankleY + kneeY) / 2, fx - shinW + S(2), kneeY);
    ctx.lineTo(fx + shinW - S(2), kneeY);
    ctx.quadraticCurveTo(fx + shinW + S(2), (ankleY + kneeY) / 2, fx + shinW, ankleY);
    ctx.closePath();
    ctx.fill();
  });

  // ── THIGHS ──
  ([-1, 1] as const).forEach((side) => {
    const fx = cx + side * S(14);
    const g = ctx.createLinearGradient(fx - thighW, 0, fx + thighW, 0);
    g.addColorStop(0, skin.dark);
    g.addColorStop(0.3, skin.mid);
    g.addColorStop(0.7, skin.base);
    g.addColorStop(1, skin.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - thighW + S(2), kneeY);
    ctx.quadraticCurveTo(fx - thighW - S(3), (kneeY + hipY) / 2, fx - S(8), hipY);
    ctx.lineTo(fx + S(8), hipY);
    ctx.quadraticCurveTo(fx + thighW + S(3), (kneeY + hipY) / 2, fx + thighW - S(2), kneeY);
    ctx.closePath();
    ctx.fill();
  });

  // ── SHORTS ──
  const tg = ctx.createLinearGradient(cx, hipY, cx, waistY + S(4));
  tg.addColorStop(0, tc);
  tg.addColorStop(1, hex(tc, 0.6));
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(cx - hipW, hipY + S(4));
  ctx.lineTo(cx + hipW, hipY + S(4));
  ctx.lineTo(cx + waistW + S(6), waistY + S(4));
  ctx.lineTo(cx - waistW - S(6), waistY + S(4));
  ctx.closePath();
  ctx.fill();
  // waistband
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(cx - waistW - S(6), waistY + S(4), (waistW + S(6)) * 2, S(10));
  // stripes
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(cx - hipW + S(4), hipY + S(14), S(10), hipY - waistY - S(14));
  ctx.fillRect(cx + hipW - S(14), hipY + S(14), S(10), hipY - waistY - S(14));

  // ── TORSO ──
  const torsoG = ctx.createLinearGradient(cx - shoulderW, 0, cx + shoulderW, 0);
  torsoG.addColorStop(0, skin.dark);
  torsoG.addColorStop(0.18, skin.mid);
  torsoG.addColorStop(0.5, skin.base);
  torsoG.addColorStop(0.82, skin.mid);
  torsoG.addColorStop(1, skin.dark);
  ctx.fillStyle = torsoG;
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW, shoulderY);
  ctx.bezierCurveTo(cx - shoulderW - S(4), chestY, cx - waistW - S(2), waistY + S(10), cx - waistW - S(4), waistY + S(4));
  ctx.lineTo(cx + waistW + S(4), waistY + S(4));
  ctx.bezierCurveTo(cx + waistW + S(2), waistY + S(10), cx + shoulderW + S(4), chestY, cx + shoulderW, shoulderY);
  ctx.closePath();
  ctx.fill();

  // chest highlight
  const chestHL = ctx.createRadialGradient(cx - S(10), chestY + S(10), 0, cx, chestY + S(20), S(28));
  chestHL.addColorStop(0, "rgba(255,255,255,0.18)");
  chestHL.addColorStop(1, "transparent");
  ctx.fillStyle = chestHL;
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW, shoulderY);
  ctx.bezierCurveTo(cx - shoulderW - S(4), chestY, cx - waistW - S(2), waistY + S(10), cx - waistW - S(4), waistY + S(4));
  ctx.lineTo(cx + waistW + S(4), waistY + S(4));
  ctx.bezierCurveTo(cx + waistW + S(2), waistY + S(10), cx + shoulderW + S(4), chestY, cx + shoulderW, shoulderY);
  ctx.closePath();
  ctx.fill();

  // pec lines
  ctx.strokeStyle = hex(skin.dark, 0.25);
  ctx.lineWidth = S(1.5);
  ctx.beginPath();
  ctx.moveTo(cx, shoulderY + S(10));
  ctx.lineTo(cx, waistY + S(4));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - S(14), chestY + S(12), S(14), -0.8, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + S(14), chestY + S(12), S(14), Math.PI - 0.8, Math.PI + 0.8);
  ctx.stroke();

  // ab lines
  for (let i = 0; i < 3; i++) {
    const ay = waistY + S(10) + i * S(14);
    ctx.strokeStyle = hex(skin.dark, 0.15);
    ctx.lineWidth = S(1.2);
    ctx.beginPath();
    ctx.moveTo(cx - S(16), ay);
    ctx.quadraticCurveTo(cx, ay + S(3), cx + S(16), ay);
    ctx.stroke();
  }

  // female sports bra
  if (cfg.gender === "female") {
    const braG = ctx.createLinearGradient(cx, chestY - S(8), cx, chestY + S(22));
    braG.addColorStop(0, hex(tc, 0.9));
    braG.addColorStop(1, hex(tc, 0.7));
    ctx.fillStyle = braG;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW + S(6), chestY - S(8));
    ctx.lineTo(cx + shoulderW - S(6), chestY - S(8));
    ctx.lineTo(cx + waistW, chestY + S(22));
    ctx.lineTo(cx - waistW, chestY + S(22));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW + S(6), chestY - S(8));
    ctx.lineTo(cx + shoulderW - S(6), chestY - S(8));
    ctx.lineTo(cx + shoulderW - S(6), chestY - S(2));
    ctx.lineTo(cx - shoulderW + S(6), chestY - S(2));
    ctx.closePath();
    ctx.fill();
  }

  // ── NECK ──
  const neckG = ctx.createLinearGradient(cx - S(10), 0, cx + S(10), 0);
  neckG.addColorStop(0, skin.dark);
  neckG.addColorStop(0.4, skin.mid);
  neckG.addColorStop(1, skin.dark);
  ctx.fillStyle = neckG;
  ctx.beginPath();
  ctx.moveTo(cx - S(10), neckY + S(14));
  ctx.lineTo(cx + S(10), neckY + S(14));
  ctx.lineTo(cx + S(8), chinY + S(4));
  ctx.lineTo(cx - S(8), chinY + S(4));
  ctx.closePath();
  ctx.fill();

  // ── ARMS (guard stance) ──
  // RIGHT arm (rear guard, tucked near chin)
  const rShoulderX = cx + shoulderW;
  const rElbowX    = cx + S(36);
  const rElbowY    = waistY - S(18);
  const rGloveX    = cx + S(42);
  const rGloveY    = chinY + S(20);
  drawArm(ctx, rShoulderX, shoulderY + S(8), rElbowX, rElbowY, rGloveX, rGloveY, tc, skin, S, "right");

  // LEFT arm (lead, slightly extended)
  const lShoulderX = cx - shoulderW;
  const lElbowX    = cx - S(44);
  const lElbowY    = waistY - S(30);
  const lGloveX    = cx - S(52);
  const lGloveY    = chinY + S(4);
  drawArm(ctx, lShoulderX, shoulderY + S(8), lElbowX, lElbowY, lGloveX, lGloveY, tc, skin, S, "left");

  // ── HEAD ──
  // head shadow/base
  const headG = ctx.createRadialGradient(cx - S(6), headCY - S(8), S(4), cx, headCY, S(32));
  headG.addColorStop(0, skin.base);
  headG.addColorStop(0.65, skin.mid);
  headG.addColorStop(1, skin.dark);
  ctx.fillStyle = headG;
  ctx.beginPath();
  ctx.ellipse(cx, headCY, S(24), S(30), 0, 0, Math.PI * 2);
  ctx.fill();

  // jawline
  ctx.strokeStyle = hex(skin.dark, 0.3);
  ctx.lineWidth = S(1.5);
  ctx.beginPath();
  ctx.arc(cx, headCY + S(10), S(20), 0.15, Math.PI - 0.15);
  ctx.stroke();

  // cheek highlights
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.ellipse(cx - S(14), headCY - S(2), S(8), S(5), -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + S(14), headCY - S(2), S(8), S(5), 0.3, 0, Math.PI * 2);
  ctx.fill();

  // ── HEADGEAR ──
  // main cap
  const hgG = ctx.createLinearGradient(cx - S(26), headTopY, cx + S(26), headCY + S(10));
  hgG.addColorStop(0, "#9F67F5");
  hgG.addColorStop(0.5, "#7C3AED");
  hgG.addColorStop(1, "#4C1D95");
  ctx.fillStyle = hgG;
  ctx.beginPath();
  ctx.arc(cx, headCY, S(26), Math.PI, 0);
  ctx.fill();
  // cheek guards
  ctx.fillStyle = "#6D28D9";
  ctx.beginPath();
  ctx.arc(cx - S(25), headCY + S(4), S(11), -0.6, 1.4);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + S(25), headCY + S(4), S(11), Math.PI - 1.4, Math.PI + 0.6);
  ctx.fill();
  // gold trim
  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = S(2.5);
  ctx.beginPath();
  ctx.arc(cx, headCY, S(26), Math.PI * 0.88, Math.PI * 0.12);
  ctx.stroke();
  // chin strap
  ctx.strokeStyle = "#4C1D95";
  ctx.lineWidth = S(3.5);
  ctx.beginPath();
  ctx.arc(cx, headCY + S(8), S(20), 0.1, Math.PI - 0.1);
  ctx.stroke();
  // headgear highlight
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.ellipse(cx - S(8), headCY - S(16), S(9), S(6), -0.5, 0, Math.PI * 2);
  ctx.fill();

  // ── HAIR ──
  drawHair(ctx, cx, headCY, headTopY, cfg.hairStyle, S);

  // ── FACE ──
  // eyes
  const eyeY = headCY - S(6);
  drawEye(ctx, cx - S(10), eyeY, S, skin);
  drawEye(ctx, cx + S(10), eyeY, S, skin);

  // nose
  ctx.fillStyle = hex(skin.dark, 0.6);
  ctx.beginPath();
  ctx.ellipse(cx - S(3), headCY + S(5), S(3), S(2.5), 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + S(3), headCY + S(5), S(3), S(2.5), -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex(skin.dark, 0.4);
  ctx.lineWidth = S(1);
  ctx.beginPath();
  ctx.moveTo(cx, headCY - S(2));
  ctx.lineTo(cx, headCY + S(4));
  ctx.stroke();

  // mouth
  ctx.strokeStyle = skin.lip;
  ctx.lineWidth = S(2);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - S(7), headCY + S(14));
  ctx.quadraticCurveTo(cx, headCY + S(17), cx + S(7), headCY + S(14));
  ctx.stroke();

  // mouthguard
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(cx - S(8), headCY + S(16), S(16), S(6), S(2));
  ctx.fill();

  // name
  ctx.font = `bold ${Math.round(S(12))}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#F59E0B";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillText(cfg.name.toUpperCase(), cx, groundY + S(22));
  ctx.shadowBlur = 0;
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  ex: number, ey: number,
  gx: number, gy: number,
  tc: string,
  skin: { base: string; mid: string; dark: string; lip: string },
  S: (v: number) => number,
  side: "left" | "right"
) {
  // upper arm
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = skin.mid;
  ctx.lineWidth = S(16);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 - S(5), ex, ey);
  ctx.stroke();
  // upper arm highlight
  ctx.strokeStyle = skin.base;
  ctx.lineWidth = S(6);
  ctx.beginPath();
  ctx.moveTo(sx - (side === "left" ? S(2) : -S(2)), sy);
  ctx.quadraticCurveTo((sx + ex) / 2 - S(2), (sy + ey) / 2 - S(8), ex - S(2), ey);
  ctx.stroke();

  // forearm
  ctx.strokeStyle = skin.dark;
  ctx.lineWidth = S(13);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.quadraticCurveTo((ex + gx) / 2, (ey + gy) / 2, gx, gy);
  ctx.stroke();
  ctx.strokeStyle = skin.mid;
  ctx.lineWidth = S(5);
  ctx.beginPath();
  ctx.moveTo(ex - S(1), ey);
  ctx.quadraticCurveTo((ex + gx) / 2 - S(1), (ey + gy) / 2, gx - S(1), gy);
  ctx.stroke();

  // glove
  const gG = ctx.createRadialGradient(gx - S(4), gy - S(4), S(1), gx, gy, S(18));
  gG.addColorStop(0, lightenHex(tc, 40));
  gG.addColorStop(0.5, tc);
  gG.addColorStop(1, darkenHex(tc, 40));
  ctx.fillStyle = gG;
  ctx.beginPath();
  ctx.ellipse(gx, gy, S(18), S(14), side === "left" ? -0.2 : 0.2, 0, Math.PI * 2);
  ctx.fill();
  // knuckles
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = lightenHex(tc, 25);
    ctx.beginPath();
    ctx.ellipse(gx - S(9) + i * S(6), gy - S(9), S(3.5), S(2.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // wrist wrap
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(gx - S(12), gy + S(6), S(24), S(6));
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(gx - S(12), gy + S(9), S(24), S(1.5));
  // glove sheen
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(gx - S(6), gy - S(6), S(8), S(5), -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  S: (v: number) => number,
  skin: { base: string; mid: string; dark: string; lip: string }
) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(x, y, S(6), S(4), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3B2A1A";
  ctx.beginPath();
  ctx.ellipse(x, y, S(3.5), S(3.5), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y, S(2), S(2), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(x + S(1.5), y - S(1.5), S(1.2), S(1.2), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex(skin.dark, 0.5);
  ctx.lineWidth = S(0.8);
  ctx.beginPath();
  ctx.ellipse(x, y, S(6), S(4), 0, Math.PI, 0);
  ctx.stroke();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  cx: number, headCY: number, headTopY: number,
  style: HairStyle,
  S: (v: number) => number
) {
  const color = "#1A1008";
  const hw = S(26);

  if (style === "bald") return;

  ctx.fillStyle = color;

  if (style === "fade" || style === "buzz") {
    ctx.beginPath();
    ctx.arc(cx, headCY - S(2), hw * 0.95, Math.PI * 1.08, Math.PI * 1.92);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - hw * 0.88, headCY + S(2), S(10), -1.1, 0.7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + hw * 0.88, headCY + S(2), S(10), Math.PI - 0.7, Math.PI + 1.1);
    ctx.fill();
  } else if (style === "afro") {
    ctx.beginPath();
    ctx.arc(cx, headCY - S(6), hw * 1.2, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - hw, headCY, S(14), -1.4, 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + hw, headCY, S(14), Math.PI - 0.6, Math.PI + 1.4);
    ctx.fill();
  } else if (style === "dreads" || style === "long") {
    ctx.beginPath();
    ctx.arc(cx, headCY - S(4), hw * 0.92, Math.PI, 0);
    ctx.fill();
    for (let i = -3; i <= 3; i++) {
      const dx = cx + i * S(7);
      ctx.strokeStyle = color;
      ctx.lineWidth = S(5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(dx, headCY - S(10));
      ctx.bezierCurveTo(dx - S(4), headCY + S(20), dx + S(4), headCY + S(40), dx + (i % 2) * S(6), headCY + S(55));
      ctx.stroke();
    }
  } else if (style === "cornrows") {
    for (let i = -2; i <= 2; i++) {
      const rx = cx + i * S(7);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(rx, headCY - S(8), S(4), Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "#0A0804";
      ctx.lineWidth = S(0.8);
      for (let j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.moveTo(rx - S(3.5), headCY - S(14) + j * S(5));
        ctx.lineTo(rx + S(3.5), headCY - S(14) + j * S(5));
        ctx.stroke();
      }
    }
  } else if (style === "mohawk") {
    ctx.fillStyle = color;
    ctx.fillRect(cx - S(7), headTopY - S(5), S(14), S(25));
    ctx.fillStyle = "#F59E0B";
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - S(7), headTopY - S(5) - i * S(8));
      ctx.lineTo(cx, headTopY - S(18) - i * S(8));
      ctx.lineTo(cx + S(7), headTopY - S(5) - i * S(8));
      ctx.fill();
    }
  } else if (style === "ponytail") {
    // base
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, headCY - S(2), hw * 0.93, Math.PI * 1.06, Math.PI * 1.94);
    ctx.fill();
    // bun/tie at back
    ctx.beginPath();
    ctx.arc(cx, headTopY + S(2), S(8), 0, Math.PI * 2);
    ctx.fill();
    // ponytail drape
    ctx.strokeStyle = color;
    ctx.lineWidth = S(7);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, headTopY + S(10));
    ctx.bezierCurveTo(cx + S(18), headCY, cx + S(22), headCY + S(20), cx + S(14), headCY + S(38));
    ctx.stroke();
  }
}

function lightenHex(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}
function darkenHex(hex: string, amt: number): string {
  return lightenHex(hex, -amt);
}

export default function Boxer2D({
  skinTone = "medium",
  trunksColor = "#F59E0B",
  hairStyle = "fade",
  bodyType = "middleweight",
  gender = "male",
  name = "FIGHTER",
  animate = true,
  width = 220,
  height = 340,
}: Boxer2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number>(0);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const cx      = width / 2;
    const groundY = height - 22;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const bob = animate ? Math.sin(frameRef.current * 0.08) * 2.5 : 0;
      drawBoxer(ctx, cx, groundY, { skinTone, trunksColor, hairStyle, bodyType, gender, name }, bob);
      if (animate) {
        frameRef.current++;
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [skinTone, trunksColor, hairStyle, bodyType, gender, name, animate, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", margin: "0 auto" }}
    />
  );
}
