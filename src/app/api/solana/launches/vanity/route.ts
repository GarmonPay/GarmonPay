import { json } from "@/lib/solana/http";
export const dynamic = "force-dynamic";
/** Retired: Create Coin generates a normal secure mint; historical records are untouched. */
export async function GET() { return json({ status: "retired", launchEnabled: false, submitted: false, reason: "Vanity mint search is retired. Use Create Coin; no suffix is required." }, 410); }
export async function POST() { return GET(); }
