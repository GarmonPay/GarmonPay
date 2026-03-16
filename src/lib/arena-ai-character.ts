/**
 * AI character generation for GarmonPay Arena — questionnaire or auto from username.
 * Uses Claude to produce a unique fighter profile; builds SVG portrait from result.
 */

import Anthropic from "@anthropic-ai/sdk";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const BODY_TYPES = ["lightweight", "middleweight", "heavyweight"] as const;
const PERSONALITIES = ["Cold", "Fierce", "Calculated", "Wild", "Silent", "Arrogant", "Humble", "Hungry"] as const;

export interface AIGeneratedCharacter {
  name: string;
  nickname: string;
  style: string;
  origin: string;
  backstory: string;
  personality: string;
  trash_talk_style: string;
  signature_move_name: string;
  signature_move_desc: string;
  stats: {
    strength: number;
    speed: number;
    stamina: number;
    defense: number;
    chin: number;
    special: number;
  };
  recommended_training: string;
  avatar: string;
  body_type: string;
  color: string;
}

function clampStat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number(n)) || 50));
}

function normalizeHex(s: string): string {
  const t = s.replace(/^#/, "").trim();
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t}`;
  if (/^[0-9A-Fa-f]{3}$/.test(t)) return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  return "#f0a500";
}

/** Build prompt for questionnaire method */
function buildQuestionnairePrompt(answers: string[], username: string): string {
  return `You are creating a unique underground boxer for GarmonPay Arena — a real-money skill gaming platform.

The user answered these questions:
Q1 (Fighting approach): ${answers[0] ?? "Not given"}
Q2 (Greatest weapon): ${answers[1] ?? "Not given"}
Q3 (Motivation): ${answers[2] ?? "Not given"}
Username: ${username}

Create a completely unique fighter profile. Stats should reflect their answers:
- THE AGGRESSOR/RAW POWER → higher strength
- THE GHOST/PRECISION → higher speed and defense
- THE WALL/IRON WILL → higher stamina and chin
- THE SPEEDSTER/RING IQ → higher speed

Return ONLY valid JSON, no markdown, no backticks:

{
  "name": "Fighter's real name (first and last, tough sounding, fits underground boxing)",
  "nickname": "The [nickname] — their ring name",
  "style": "one of exactly: Brawler, Boxer, Slugger, Pressure Fighter, Counterpuncher, Swarmer",
  "origin": "City, State or Country they fight out of",
  "backstory": "2-3 sentences. Gritty origin story. How they got into underground boxing. What made them dangerous. Reference their answers naturally.",
  "personality": "one of: Cold, Fierce, Calculated, Wild, Silent, Arrogant, Humble, Hungry",
  "trash_talk_style": "one of: Silent intimidation, Loud and disrespectful, Psychological warfare, Compliments before destroying you",
  "signature_move_name": "Unique name for their finishing move (2-4 words, dramatic, personalized)",
  "signature_move_desc": "One sentence describing the move dramatically",
  "stats": {
    "strength": number 45-75,
    "speed": number 45-75,
    "stamina": number 45-75,
    "defense": number 45-75,
    "chin": number 45-75,
    "special": number 20-45
  },
  "recommended_training": "One sentence on what they should train first",
  "avatar": "single emoji that represents them",
  "body_type": "lightweight, middleweight, or heavyweight",
  "color": "their signature color as hex code"
}`;
}

/** Build prompt for auto (username-only) method */
function buildAutoPrompt(username: string): string {
  return `Create a unique underground boxer for GarmonPay Arena based only on this username: ${username}

Draw inspiration from the username for their personality, name, and fighting style. Be creative and make it feel personal to them.

Return ONLY valid JSON, no markdown, no backticks:

{
  "name": "Fighter name inspired by username",
  "nickname": "The [nickname]",
  "style": "Brawler, Boxer, Slugger, Pressure Fighter, Counterpuncher, or Swarmer",
  "origin": "City and state/country",
  "backstory": "2-3 sentences, gritty origin",
  "personality": "Cold, Fierce, Calculated, Wild, Silent, Arrogant, Humble, or Hungry",
  "trash_talk_style": "their trash talk approach",
  "signature_move_name": "2-4 word move name",
  "signature_move_desc": "One dramatic sentence",
  "stats": {
    "strength": 45-75,
    "speed": 45-75,
    "stamina": 45-75,
    "defense": 45-75,
    "chin": 45-75,
    "special": 20-45
  },
  "recommended_training": "What to train first",
  "avatar": "single emoji",
  "body_type": "lightweight, middleweight, or heavyweight",
  "color": "hex color code"
}`;
}

/** Parse and validate Claude response into AIGeneratedCharacter */
function parseCharacterResponse(raw: unknown): AIGeneratedCharacter {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const stats = (o.stats && typeof o.stats === "object" && o.stats !== null ? o.stats as Record<string, unknown> : {});
  const style =
    typeof o.style === "string" && STYLES.includes(o.style as (typeof STYLES)[number])
      ? o.style
      : STYLES[0];
  const body_type =
    typeof o.body_type === "string" && BODY_TYPES.includes(o.body_type as (typeof BODY_TYPES)[number])
      ? o.body_type
      : "middleweight";
  const personality =
    typeof o.personality === "string" && PERSONALITIES.includes(o.personality as (typeof PERSONALITIES)[number])
      ? o.personality
      : PERSONALITIES[0];

  return {
    name: typeof o.name === "string" ? o.name.trim().slice(0, 50) : "Shadow",
    nickname: typeof o.nickname === "string" ? o.nickname.trim().slice(0, 80) : "The Unknown",
    style,
    origin: typeof o.origin === "string" ? o.origin.trim().slice(0, 100) : "Unknown",
    backstory: typeof o.backstory === "string" ? o.backstory.trim().slice(0, 600) : "A fighter with a past.",
    personality,
    trash_talk_style: typeof o.trash_talk_style === "string" ? o.trash_talk_style.trim().slice(0, 80) : "Silent intimidation",
    signature_move_name: typeof o.signature_move_name === "string" ? o.signature_move_name.trim().slice(0, 60) : "Finishing Blow",
    signature_move_desc: typeof o.signature_move_desc === "string" ? o.signature_move_desc.trim().slice(0, 200) : "One punch to end it.",
    stats: {
      strength: clampStat(Number(stats.strength), 45, 75),
      speed: clampStat(Number(stats.speed), 45, 75),
      stamina: clampStat(Number(stats.stamina), 45, 75),
      defense: clampStat(Number(stats.defense), 45, 75),
      chin: clampStat(Number(stats.chin), 45, 75),
      special: clampStat(Number(stats.special), 20, 45),
    },
    recommended_training: typeof o.recommended_training === "string" ? o.recommended_training.trim().slice(0, 150) : "Train your weakest stat first.",
    avatar: typeof o.avatar === "string" ? o.avatar.trim().slice(0, 10) || "🥊" : "🥊",
    body_type,
    color: typeof o.color === "string" ? normalizeHex(o.color) : "#f0a500",
  };
}

/** Fallback character when Claude fails (based on answers if provided) */
function fallbackCharacter(answers: string[], username: string): AIGeneratedCharacter {
  const a1 = answers[0] ?? "THE AGGRESSOR";
  const name = username.trim().slice(0, 20) || "Fighter";
  const style = STYLES[Math.abs(name.length) % STYLES.length];
  const body_type = a1.includes("WALL") ? "heavyweight" : a1.includes("SPEED") ? "lightweight" : "middleweight";
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
    nickname: `The ${style}`,
    style,
    origin: "Underground",
    backstory: "Forged in the underground circuit. No handouts, no excuses.",
    personality: "Hungry",
    trash_talk_style: "Silent intimidation",
    signature_move_name: "Midnight Special",
    signature_move_desc: "One shot from the shadows.",
    stats: {
      strength: 55,
      speed: 55,
      stamina: 55,
      defense: 55,
      chin: 55,
      special: 25,
    },
    recommended_training: "Train your weakest stat first.",
    avatar: "🥊",
    body_type,
    color: "#f0a500",
  };
}

/** Call Claude and return parsed character or null */
export async function generateAICharacter(
  method: "questionnaire" | "auto",
  username: string,
  answers: string[] = []
): Promise<AIGeneratedCharacter | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[arena-ai-character] ANTHROPIC_API_KEY not set");
    return null;
  }

  const prompt =
    method === "questionnaire"
      ? buildQuestionnairePrompt(answers, username)
      : buildAutoPrompt(username);

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    const text = block && "text" in block && typeof block.text === "string" ? block.text : "";
    if (!text.trim()) {
      console.error("[arena-ai-character] Empty Claude response");
      return null;
    }

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as unknown;
    return parseCharacterResponse(parsed);
  } catch (err) {
    console.error("[arena-ai-character] Claude error:", err);
    return null;
  }
}

/** Generate with one retry and fallback to pre-built character */
export async function generateAICharacterWithFallback(
  method: "questionnaire" | "auto",
  username: string,
  answers: string[] = []
): Promise<AIGeneratedCharacter> {
  let result = await generateAICharacter(method, username, answers);
  if (result) return result;
  result = await generateAICharacter(method, username, answers);
  if (result) return result;
  return fallbackCharacter(answers, username);
}

/** Build dynamic SVG portrait from character data */
export function buildPortraitSVG(character: AIGeneratedCharacter): string {
  const color = character.color;
  const dark = color.replace(/#/, "#44"); // darker variant
  const nameLine = character.nickname.length > 24 ? character.nickname.slice(0, 21) + "…" : character.nickname;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${dark}"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="200" height="260" fill="url(#bg)"/>
  <rect x="20" y="40" width="160" height="180" rx="8" fill="rgba(0,0,0,0.4)" filter="url(#shadow)"/>
  <circle cx="100" cy="95" r="42" fill="rgba(255,255,255,0.08)"/>
  <circle cx="100" cy="92" r="35" fill="#1f2937"/>
  <text x="100" y="98" text-anchor="middle" font-size="28" fill="white">${escapeXml(character.avatar)}</text>
  <rect x="70" y="145" width="60" height="50" rx="4" fill="${color}" opacity="0.9"/>
  <text x="100" y="175" text-anchor="middle" font-size="14" font-weight="bold" fill="white">${escapeXml(character.avatar)}</text>
  <text x="100" y="235" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}">${escapeXml(nameLine)}</text>
  <text x="100" y="250" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.6)">${escapeXml(character.origin)}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
