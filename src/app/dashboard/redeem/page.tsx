"use client";

export default function RedeemPage() {
  return (
    <div className="min-h-screen bg-[#0e0118] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">🪙</div>
        <h1 className="font-['Cinzel_Decorative'] text-4xl text-[#f5c842]">
          $GPAY Redemption
        </h1>
        <p className="text-gray-300 font-['DM_Sans']">
          Convert your GPay Coins to $GPAY tokens — the official GarmonPay
          prize token on Solana.
        </p>
        <div className="bg-[#1a0a2e] border border-[#7c3aed] rounded-lg p-6 space-y-3">
          <div className="text-[#f5c842] font-bold text-lg">Coming Soon</div>
          <p className="text-sm text-gray-400">
            $GPAY token launch is coming. Once live, you&apos;ll be able to
            redeem your GPC winnings directly to your Solana wallet.
          </p>
        </div>
        <p className="text-xs text-gray-500">
          Stay tuned for the official launch announcement.
        </p>
      </div>
    </div>
  );
}
