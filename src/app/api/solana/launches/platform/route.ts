import { Connection } from "@solana/web3.js";
import { isAdmin } from "@/lib/admin-auth";
import { json, smallJson, trustedBrowserOrigin } from "@/lib/solana/http";
import { rateLimitOr429 } from "@/lib/rate-limit";
import { authorizedPlatformWallets, garmonPlatformId, platformFeePlan } from "@/lib/solana/platform-setup";
import { buildPlatformConfigTransaction } from "@/lib/solana/platform-transaction";
import { DEVNET_RPC } from "@/lib/solana/launchlab-flow";
import { DEV_LAUNCHPAD_PROGRAM } from "@raydium-io/raydium-sdk-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) return json({ error: "Admin session required", submitted: false, platformExists: false }, 401);
  const wallets = authorizedPlatformWallets();
  const plan = platformFeePlan();
  const platformId = garmonPlatformId(wallets.admin, "devnet");
  try {
    const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const [adminLamports, account, rentLamports] = await Promise.all([
      connection.getBalance(wallets.admin, "confirmed"),
      connection.getAccountInfo(platformId, "confirmed"),
      connection.getMinimumBalanceForRentExemption(944),
    ]);
    return json({
      configured: true,
      source: "authorized-admin",
      submitted: false,
      platformExists: account != null,
      cluster: "devnet",
      programId: DEV_LAUNCHPAD_PROGRAM.toBase58(),
      platformId: platformId.toBase58(),
      admin: wallets.admin.toBase58(),
      fee: wallets.fee.toBase58(),
      nft: wallets.nft.toBase58(),
      vesting: wallets.vesting.toBase58(),
      feeRate: plan.platform,
      creatorFeeRate: plan.creator,
      requiredSigner: wallets.admin.toBase58(),
      adminLamports,
      rentLamports,
      estimatedCostLamports: rentLamports + 5000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Devnet status is unavailable";
    return json({
      configured: true,
      source: "authorized-admin",
      submitted: false,
      platformExists: false,
      cluster: "devnet",
      programId: DEV_LAUNCHPAD_PROGRAM.toBase58(),
      platformId: platformId.toBase58(),
      admin: wallets.admin.toBase58(),
      fee: wallets.fee.toBase58(),
      nft: wallets.nft.toBase58(),
      vesting: wallets.vesting.toBase58(),
      feeRate: plan.platform,
      creatorFeeRate: plan.creator,
      requiredSigner: wallets.admin.toBase58(),
      error: message.slice(0, 180),
    }, 503);
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) return json({ error: "Admin session required", submitted: false, platformExists: false }, 401);
  const limited = rateLimitOr429(request, "solana-platform-prepare", 10);
  if (limited) return limited;
  if (!trustedBrowserOrigin(request)) return json({ error: "Origin rejected", submitted: false, platformExists: false }, 403);
  try {
    const body = await smallJson(request);
    const wallets = authorizedPlatformWallets();
    if (typeof body.admin === "string" && body.admin !== wallets.admin.toBase58()) {
      return json({ error: "Platform creation is restricted to the authorized admin wallet", submitted: false, platformExists: false }, 403);
    }
    const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const latest = await connection.getLatestBlockhash("confirmed");
    const rentLamports = await connection.getMinimumBalanceForRentExemption(944);
    const prepared = buildPlatformConfigTransaction(wallets, latest.blockhash, rentLamports.toString());
    return json({ ...prepared, source: "authorized-admin", lastValidBlockHeight: latest.lastValidBlockHeight });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Platform transaction could not be prepared";
    const status = /public address|Solana address|separate|default platform/.test(message) ? 400 : 503;
    return json({ error: message.slice(0, 180), submitted: false, platformExists: false }, status);
  }
}
