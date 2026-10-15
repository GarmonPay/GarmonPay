import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Risk Disclosures · GarmonPay" };

export default function RiskPage() {
  return <main id="main-content" className="gp-sol-page gp-fee-sheet">
    <p className="gp-sol-eyebrow">GARMONPAY</p>
    <h1>Risk disclosures</h1>
    <section className="gp-sol-panel">
      <p>Token prices can fall to zero. A listing is not a recommendation.</p>
      <p>Buying, selling, launching, and withdrawals are not open on GarmonPay. A draft saved in your browser is not a token.</p>
      <p>When trading opens, the fee schedule is shown again before you confirm a transaction. Network fees are separate.</p>
      <p>GarmonPay does not hold your wallet. Never share a seed phrase or private key.</p>
      <p>You must be 18 or older. This is not investment, legal, or tax advice.</p>
      <p><Link href="/solana/fees">Fee schedule</Link></p>
    </section>
  </main>;
}
