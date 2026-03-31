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

function lightenHex(h: string, amount: number): string {
  const n = parseInt(h.replace("#", ""), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amount / 100;
  r = Math.min(255, Math.round(r + (255 - r) * t));
  g = Math.min(255, Math.round(g + (255 - g) * t));
  b = Math.min(255, Math.round(b + (255 - b) * t));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function darkenHex(h: string, amount: number): string {
  const n = parseInt(h.replace("#", ""), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amount / 100;
  r = Math.max(0, Math.round(r * (1 - t)));
  g = Math.max(0, Math.round(g * (1 - t)));
  b = Math.max(0, Math.round(b * (1 - t)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
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

  const S = (v: number) => v * sc;

  const footY     = groundY + bob * 0.2;
  const ankleY    = footY   - S(18);
  const kneeY     = ankleY  - S(80);
  const hipY      = kneeY   - S(82);
  const waistY    = hipY    - S(28);
  const chestY    = waistY  - S(60);
  const shoulderY = chestY  - S(18);
  const neckY     = shoulderY - S(8);
  const chinY     = neckY   - S(14);
  const headCY    = chinY   - S(28);
  const headTopY  = headCY  - S(32);

  const shoulderW = S(cfg.gender === "female" ? 44 : 52);
  const hipW      = S(cfg.gender === "female" ? 38 : 42);
  const waistW    = S(cfg.gender === "female" ? 28 : 32);
  const thighW    = S(18);
  const shinW     = S(13);

  const shad = ctx.createRadialGradient(cx, footY + 6, 2, cx, footY + 6, S(40));
  shad.addColorStop(0, "rgba(0,0,0,0.45)");
  shad.addColorStop(1, "transparent");
  ctx.fillStyle = shad;
  ctx.beginPath();
  ctx.ellipse(cx, footY + 6, S(40), S(10), 0, 0, Math.PI * 2);
  ctx.fill();

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

  ([-1, 1] as const).forEach((side) => {
    const fx = cx + side * S(13);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(fx - S(9), ankleY - S(4), S(18), S(16));
    ctx.fillStyle = tc;
    ctx.fillRect(fx - S(9), ankleY - S(4), S(18), S(4));
  });

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
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(cx - waistW - S(6), waistY + S(4), (waistW + S(6)) * 2, S(10));
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(cx - hipW + S(4), hipY + S(14), S(10), hipY - waistY - S(14));
  ctx.fillRect(cx + hipW - S(14), hipY + S(14), S(10), hipY - waistY - S(14));

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

  for (let i = 0; i < 3; i++) {
    const ay = waistY + S(10) + i * S(14);
    ctx.strokeStyle = hex(skin.dark, 0.15);
    ctx.lineWidth = S(1.2);
    ctx.beginPath();
    ctx.moveTo(cx - S(16), ay);
    ctx.quadraticCurveTo(cx, ay + S(3), cx + S(16), ay);
    ctx.stroke();
  }

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

  const rShoulderX = cx + shoulderW;
  const rElbowX    = cx + S(36);
  const rElbowY    = waistY - S(18);
  const rGloveX    = cx + S(42);
  const rGloveY    = chinY + S(20);
  drawArm(ctx, rShoulderX, shoulderY + S(8), rElbowX, rElbowY, rGloveX, rGloveY, tc, skin, S, "right");

  const lShoulderX = cx - shoulderW;
  const lElbowX    = cx - S(44);
  const lElbowY    = waistY - S(30);
  const lGloveX    = cx - S(52);
  const lGloveY    = chinY + S(4);
  drawArm(ctx, lShoulderX, shoulderY + S(8), lElbowX, lElbowY, lGloveX, lGloveY, tc, skin, S, "left");

  const headG = ctx.createRadialGradient(cx - S(6), headCY - S(8), S(4), cx, headCY, S(32));
  headG.addColorStop(0, skin.base);
  headG.addColorStop(0.65, skin.mid);
  headG.addColorStop(1, skin.dark);
  ctx.fillStyle = headG;
  ctx.beginPath();
  ctx.ellipse(cx, headCY, S(24), S(30), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hex(skin.dark, 0.3);
  ctx.lineWidth = S(1.5);
  ctx.beginPath();
  ctx.arc(cx, headCY + S(10), S(20), 0.15, Math.PI - 0.15);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.beginPath();
  ctx.ellipse(cx - S(14), headCY - S(2), S(8), S(5), -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + S(14), headCY - S(2), S(8), S(5), 0.3, 0, Math.PI * 2);
  ctx.fill();

  const hgG = ctx.createLinearGradient(cx - S(26), headTopY, cx + S(26), headCY + S(10));
  hgG.addColorStop(0, "#9F67F5");
  hgG.addColorStop(0.5, "#7C3AED");
  hgG.addColorStop(1, "#4C1D95");
  ctx.fillStyle = hgG;
  ctx.beginPath();
  ctx.arc(cx, headCY, S(26), Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#6D28D9";
  ctx.beginPath();
  ctx.arc(cx - S(25), headCY + S(4), S(11), -0.6, 1.4);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + S(25), headCY + S(4), S(11), Math.PI - 1.4, Math.PI + 0.6);
  ctx.fill();
  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = S(2.5);
  ctx.beginPath();
  ctx.arc(cx, headCY, S(26), Math.PI * 0.88, Math.PI * 0.12);
  ctx.stroke();
  ctx.strokeStyle = "#4C1D95";
  ctx.lineWidth = S(3.5);
  ctx.beginPath();
  ctx.arc(cx, headCY + S(8), S(20), 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.beginPath();
  ctx.ellipse(cx - S(8), headCY - S(16), S(9), S(6), -0.5, 0, Math.PI * 2);
  ctx.fill();

  drawHair(ctx, cx, headCY, headTopY, cfg.hairStyle, S);

  const eyeY = headCY - S(6);
  drawEye(ctx, cx - S(10), eyeY, S, skin);
  drawEye(ctx, cx + S(10), eyeY, S, skin);

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

  ctx.strokeStyle = skin.lip;
  ctx.lineWidth = S(2);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - S(7), headCY + S(14));
  ctx.quadraticCurveTo(cx, headCY + S(17), cx + S(7), headCY + S(14));
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(cx - S(8), headCY + S(16), S(16), S(6), S(2));
  ctx.fill();

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
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = skin.mid;
  ctx.lineWidth = S(16);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 - S(5), ex, ey);
  ctx.stroke();
  ctx.strokeStyle = skin.base;
  ctx.lineWidth = S(6);
  ctx.beginPath();
  ctx.moveTo(sx - (side === "left" ? S(2) : -S(2)), sy);
  ctx.quadraticCurveTo((sx + ex) / 2 - S(2), (sy + ey) / 2 - S(8), ex - S(2), ey);
  ctx.stroke();

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

  const gG = ctx.createRadialGradient(gx - S(4), gy - S(4), S(1), gx, gy, S(18));
  gG.addColorStop(0, lightenHex(tc, 40));
  gG.addColorStop(0.5, tc);
  gG.addColorStop(1, darkenHex(tc, 40));
  ctx.fillStyle = gG;
  ctx.beginPath();
  ctx.ellipse(gx, gy, S(18), S(14), side === "left" ? -0.2 : 0.2, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = lightenHex(tc, 25);
    ctx.beginPath();
    ctx.ellipse(gx - S(9) + i * S(6), gy - S(9), S(3.5), S(2.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(gx - S(12), gy + S(6), S(24), S(6));
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(gx - S(12), gy + S(9), S(24), S(1.5));
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
    ctx.arc(cx, headCY - S(8), hw, Math.PI, 0);
    ctx.lineTo(cx + hw * 0.92, headCY + S(6));
    ctx.quadraticCurveTo(cx, headCY + S(14), cx - hw * 0.92, headCY + S(6));
    ctx.closePath();
    ctx.fill();
    if (style === "buzz") {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = S(0.8);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * S(5), headCY - S(4));
        ctx.lineTo(cx + i * S(5), headCY + S(10));
        ctx.stroke();
      }
    }
    return;
  }
  if (style === "dreads") {
    ctx.lineCap = "round";
    for (let i = -3; i <= 3; i++) {
      const dx = i * S(7);
      ctx.beginPath();
      ctx.moveTo(cx + dx, headTopY + S(4));
      ctx.quadraticCurveTo(cx + dx + S(4), headCY + S(40), cx + dx + S(2), headCY + S(70));
      ctx.lineWidth = S(5);
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    return;
  }
  if (style === "cornrows") {
    ctx.lineCap = "round";
    for (let i = -3; i <= 3; i++) {
      const dx = i * S(6);
      ctx.beginPath();
      ctx.moveTo(cx + dx, headTopY);
      ctx.lineTo(cx + dx * 0.35, headCY - S(4));
      ctx.strokeStyle = color;
      ctx.lineWidth = S(3);
      ctx.stroke();
    }
    return;
  }
  if (style === "afro") {
    ctx.beginPath();
    ctx.arc(cx, headCY - S(4), hw + S(8), Math.PI, 0);
    ctx.arc(cx, headCY - S(4), hw * 0.45, 0, Math.PI, true);
    ctx.fill();
    return;
  }
  if (style === "mohawk") {
    ctx.beginPath();
    ctx.moveTo(cx - S(8), headCY - S(4));
    ctx.lineTo(cx - S(4), headTopY - S(24));
    ctx.lineTo(cx + S(4), headTopY - S(24));
    ctx.lineTo(cx + S(8), headCY - S(4));
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (style === "long" || style === "ponytail") {
    ctx.beginPath();
    ctx.arc(cx, headCY - S(6), hw, Math.PI * 1.05, Math.PI * 1.95);
    ctx.lineTo(cx + S(6), headCY + S(50));
    ctx.quadraticCurveTo(cx, headCY + S(70), cx - S(6), headCY + S(50));
    ctx.closePath();
    ctx.fill();
    if (style === "ponytail") {
      ctx.beginPath();
      ctx.ellipse(cx, headCY + S(78), S(10), S(16), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export default function Boxer2D({
  skinTone = "medium",
  trunksColor = "#f0a500",
  hairStyle = "fade",
  bodyType = "middleweight",
  gender = "male",
  name = "Fighter",
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

    const cx = width / 2;
    const groundPad = Math.max(28, Math.min(48, height * 0.12));
    const groundY = height - groundPad;

    const cfg: Required<Omit<Boxer2DProps, "animate" | "width" | "height">> = {
      skinTone,
      trunksColor,
      hairStyle,
      bodyType,
      gender,
      name,
    };

    const tick = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = (t - startRef.current) / 1000;
      const bob = animate ? Math.sin(elapsed * 1.25) * 2 : 0;
      ctx.clearRect(0, 0, width, height);
      drawBoxer(ctx, cx, groundY, cfg, bob);
      if (animate) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (animate) {
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, width, height);
      drawBoxer(ctx, cx, groundY, cfg, 0);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = 0;
    };
  }, [skinTone, trunksColor, hairStyle, bodyType, gender, name, animate, width, height]);

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
