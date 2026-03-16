/**
 * Generate an AI opponent via Claude API. Returns name, style, avatar, 6 stats, taunt, weakness.
 * Returns null on any failure (caller should fall back to CPU fighter).
 */

import Anthropic from "@anthropic-ai/sdk";

export interface AIGeneratedFighter {
  name: string;
  style: string;
  avatar: string;
  strength: number;
  speed: number;
  stamina: number;
  defense: number;
  chin: number;
  special: number;
  taunt: string;
  weakness: string;
}

const STAT_CAP = 99;
const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;

function clampStat(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(n) || 50));
}

/** Generate AI fighter JSON via Claude. Returns null if API key missing or call fails. */
export async function generateAIFighter(
  _playerWins: number,
  _playerTotalStats: number
): Promise<AIGeneratedFighter | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Anthropic error: ANTHROPIC_API_KEY not set");
    return null;
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Generate a unique underground boxing fighter for GarmonPay Arena. Return valid JSON only, no other text, no markdown, no backticks:
{
  "name": "fighter name",
  "style": "one of: Brawler/Boxer/Slugger/Pressure Fighter/Counterpuncher/Swarmer",
  "avatar": "single emoji",
  "strength": number between 45-85,
  "speed": number between 45-85,
  "stamina": number between 45-85,
  "defense": number between 45-85,
  "chin": number between 45-85,
  "special": number between 20-70,
  "taunt": "one trash talk line under 10 words",
  "weakness": "one word"
}`,
        },
      ],
    });

    const block = message.content[0];
    const text =
      block && "text" in block && typeof block.text === "string" ? block.text : "";
    if (!text.trim()) {
      console.error("Anthropic error: empty or non-text content");
      return null;
    }

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as Record<string, unknown>;

    const style =
      typeof parsed.style === "string" && STYLES.includes(parsed.style as (typeof STYLES)[number])
        ? parsed.style
        : STYLES[0];
    const fighter: AIGeneratedFighter = {
      name: typeof parsed.name === "string" ? parsed.name.trim().slice(0, 50) : "Shadow",
      style,
      avatar: typeof parsed.avatar === "string" ? parsed.avatar.trim().slice(0, 10) || "🥊" : "🥊",
      strength: clampStat(Number(parsed.strength), 1, STAT_CAP),
      speed: clampStat(Number(parsed.speed), 1, STAT_CAP),
      stamina: clampStat(Number(parsed.stamina), 1, STAT_CAP),
      defense: clampStat(Number(parsed.defense), 1, STAT_CAP),
      chin: clampStat(Number(parsed.chin), 1, STAT_CAP),
      special: clampStat(Number(parsed.special), 1, 50),
      taunt: typeof parsed.taunt === "string" ? parsed.taunt.trim().slice(0, 60) : "Let's go.",
      weakness: typeof parsed.weakness === "string" ? parsed.weakness.trim().slice(0, 40) : "none",
    };
    return fighter;
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Anthropic error:", err?.message ?? error);
    console.error("API Key exists:", !!process.env.ANTHROPIC_API_KEY);
    return null;
  }
}
