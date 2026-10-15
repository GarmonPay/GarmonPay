import { DevnetPlatformStatus } from "@/components/admin/DevnetPlatformStatus";
import { DevnetBalance } from "@/components/solana/DevnetBalance";
import { PlatformWalletGuide } from "@/components/solana/PlatformWalletGuide";

export default function AdminLaunchpadPage() {
  return <div className="space-y-6 max-w-3xl">
    <div>
      <h1 className="text-xl font-bold text-white">Devnet launchpad</h1>
      <p className="text-sm text-fintech-muted mt-1">Platform setup stays in this admin session. Mainnet launches, trading, and withdrawals stay off.</p>
    </div>
    <DevnetPlatformStatus />
    <DevnetBalance />
    <PlatformWalletGuide />
  </div>;
}
