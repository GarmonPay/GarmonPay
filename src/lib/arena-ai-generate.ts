/**
 * Generate an AI opponent via Claude API. Returns name, style, avatar, 6 stats, taunt, weakness.
 * Difficulty scaled to player tier (wins + total stats).
 */

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

/** Tier from 0 (new) to 3 (veteran) based on wins and total stats. */
export function playerTier(wins: number, totalStats: number): number {
  if (wins >= 20 || totalStats >= 400) return 3;
  if (wins >= 10 || totalStats >= 320) return 2;
  if (wins >= 3 || totalStats >= 280) return 1;
  return 0;
}

/** Generate AI fighter JSON via Claude. */
export async function generateAIFighter(
  playerWins: number,
  playerTotalStats: number
): Promise<AIGeneratedFighter | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const tier = playerTier(playerWins, playerTotalStats);
  const tierDesc = ["beginner", "amateur", "experienced", "veteran"][tier];

  const system = `You are a game assistant. Reply with a single JSON object only, no markdown or explanation.`;
  const user = `Generate a boxing opponent for a ${tierDesc} player (player has ${playerWins} wins and ${playerTotalStats} total stats). Return exactly this JSON (use only the keys below, values as described):
{
  "name": "A catchy fighter nickname (one or two words)",
  "style": "One of: Brawler, Boxer, Slugger, Counter Puncher, Swarmer, Technician",
  "avatar": "A single emoji (e.g. 🥊 or 👊)",
  "strength": number 1-${STAT_CAP},
  "speed": number 1-${STAT_CAP},
  "stamina": number 1-${STAT_CAP},
  "defense": number 1-${STAT_CAP},
  "chin": number 1-${STAT_CAP},
  "special": number 1-50,
  "taunt": "One short punchy line they say before the fight (max 60 chars)",
  "weakness": "One short phrase describing their weakness (max 40 chars)"
}
Scale stats so the opponent is challenging but fair for a ${tierDesc} player. Total of the 6 stats should be around ${280 + tier * 60 + Math.floor(Math.random() * 40)}.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as AIGeneratedFighter;
    if (!parsed.name || !parsed.style || !parsed.taunt) return null;
    parsed.strength = Math.max(1, Math.min(STAT_CAP, Number(parsed.strength) || 50));
    parsed.speed = Math.max(1, Math.min(STAT_CAP, Number(parsed.speed) || 50));
    parsed.stamina = Math.max(1, Math.min(STAT_CAP, Number(parsed.stamina) || 50));
    parsed.defense = Math.max(1, Math.min(STAT_CAP, Number(parsed.defense) || 50));
    parsed.chin = Math.max(1, Math.min(STAT_CAP, Number(parsed.chin) || 50));
    parsed.special = Math.max(1, Math.min(50, Number(parsed.special) || 20));
    parsed.avatar = parsed.avatar?.trim() || "🥊";
    return parsed;
  } catch {
    return null;
  }
}
