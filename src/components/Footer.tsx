import Link from "next/link";
import { GarmonPayWordmark } from "./GarmonPayWordmark";

export default function Footer() {
  return (
    <footer className="gp-public-footer">
      <div className="gp-footer-inner">
        <div className="gp-footer-platform"><div><GarmonPayWordmark href="/" /><p>Discover projects. Prepare your next idea.<br />Explore with clear expectations.</p></div><nav aria-label="Footer ecosystem"><Link href="/solana/launchpad">Launchpad</Link><Link href="/solana/trade">Trade</Link><Link href="/solana/earn">Earn</Link><Link href="/solana/advertise">Advertise</Link><Link href="/solana/referrals">Referrals</Link><Link href="/games">Games</Link></nav></div>
        <nav className="gp-footer-legal" aria-label="Legal">
          <Link href="/solana/fees">Fees</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/risk">Risk Disclosures</Link>
          <Link href="/income-disclaimer">Income Disclaimer</Link>
          <Link href="/referral-program">Referral Program Terms</Link>
          <Link href="/terms#sweepstakes">Sweepstakes Rules</Link>
          <Link href="/free-entry">Free Entry</Link>
        </nav>
        <p className="mt-8 text-center text-gray-500 text-xs leading-relaxed max-w-2xl mx-auto">
          GarmonPay is a sweepstakes entertainment platform. No purchase necessary to play. Must be 18+.
          Void where prohibited. Not available in Washington State. © 2026 GarmonPay LLC. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
