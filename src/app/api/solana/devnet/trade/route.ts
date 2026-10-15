import { json, smallJson, trustedBrowserOrigin } from "@/lib/solana/http";
import { getSolanaSession } from "@/lib/solana/session";
import { rateLimitOr429 } from "@/lib/rate-limit";
import { DevnetBlockhashError } from "@/lib/solana/devnet-blockhash";
import { DevnetSubmissionError } from "@/lib/solana/devnet-submission";
import { prepareDevnetTrade, readDevnetTradeContext, submitDevnetTrade, type TradeSide } from "@/lib/solana/devnet-trade";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function sideOf(value: unknown): TradeSide {
  if (value === "buy" || value === "sell") return value;
  throw new Error("Choose buy or sell");
}

function fail(error: unknown) {
  if (error instanceof DevnetBlockhashError) return json({ error: error.message, code: error.code, submitted: false, confirmed: false, cluster: "devnet" }, 409);
  if (error instanceof DevnetSubmissionError) return json({ error: error.message, code: "SUBMISSION_UNCERTAIN", submitted: true, confirmed: false, cluster: "devnet", signature: error.signature, explorerTransaction: `https://explorer.solana.com/tx/${error.signature}?cluster=devnet` }, 409);
  const message = error instanceof Error ? error.message : "Devnet trade did not finish";
  const status = /invalid|Choose|Slippage|between|too large|too small|wallet/i.test(message) ? 400 : 409;
  return json({ error: message.slice(0, 220), submitted: false, confirmed: false, cluster: "devnet" }, status);
}

export async function GET(request: Request) {
  const limited = rateLimitOr429(request, "solana-devnet-trade-read", 60);
  if (limited) return limited;
  const session = await getSolanaSession();
  if (!session) return json({ signedIn: false, tradingOpen: false });
  const mint = new URL(request.url).searchParams.get("mint") ?? "";
  try {
    return json(await readDevnetTradeContext(session.wallet, mint));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  if (!trustedBrowserOrigin(request)) return json({ error: "Origin rejected", submitted: false, confirmed: false }, 403);
  const limited = rateLimitOr429(request, "solana-devnet-trade", 40);
  if (limited) return limited;
  try {
    const body = await smallJson(request);
    const action = body.action === "submit" ? "submit" : "prepare";
    const payer = typeof body.payer === "string" ? body.payer : "";
    const mint = typeof body.mint === "string" ? body.mint : "";
    const amount = typeof body.amount === "string" ? body.amount : "";
    const slippage = typeof body.slippage === "number" ? body.slippage : 100;
    const side = sideOf(body.side);
    const session = await getSolanaSession();
    if (!session || session.wallet !== payer) return json({ error: "Sign in as the connected wallet before trading." }, 401);
    if (action === "prepare") return json(await prepareDevnetTrade({ payer, mint, side, amount, slippage }));
    const transaction = typeof body.transaction === "string" ? body.transaction : "";
    const lastValidBlockHeight = typeof body.lastValidBlockHeight === "number" ? body.lastValidBlockHeight : -1;
    return json(await submitDevnetTrade({ payer, mint, side, amount, slippage, transaction, lastValidBlockHeight }));
  } catch (error) {
    return fail(error);
  }
}
