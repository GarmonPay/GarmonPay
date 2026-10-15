import { describeTradingFees } from "./launch-fees";
import { SOLANA_POLICY } from "./policy";

/** Submission stays off on the website. Fee facts describe documented caps, not a charge. */
export function assessLaunchSubmission() {
  const fees = describeTradingFees();
  return {
    launchEnabled: false as const,
    transactionBuilt: false as const,
    walletSigning: "paused" as const,
    targetLaunchFeeLamports: SOLANA_POLICY.launchFeeLamports,
    curve: "virtual_constant_product",
    holderDistribution: "unsupported" as const,
    fees,
    reasons: [
      "This website cannot submit a launch. Wallet signing is paused, and mainnet is disabled.",
      "GarmonPay needs its own LaunchLab platform. Raydium's default platform is rejected. The admin signature is still required before the devnet platform account exists.",
      "The approved curve fees are 1.20% for GarmonPay and 0.30% for the token creator, which is 1.50% together.",
      `The public devnet SOL config adds a separate ${Number(fees.protocolTradeFeeRate) / 10000}% protocol fee on buys and sells. The curve total is 1.75%, not 1.50%.`,
      "Each coin gets a new Solana mint when it is launched. A vanity suffix is not required.",
      "New platforms must set the post-graduation creator LP scale to 0.",
      "Holder rewards are not a LaunchLab distribution. The choice is stored with this draft only.",
      "The basic GarmonPay launch fee is not charged. Network, rent, and protocol costs still apply on a real launch.",
      "Artwork stays on this device. There is no metadata host for an image.",
    ],
  };
}
