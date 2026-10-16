import Link from "next/link";

const points = [
  {
    title: "Launch",
    body: "Creators prepare a Solana coin on Raydium LaunchLab. GarmonPay does not run a separate bonding curve or an official GPAY token.",
  },
  {
    title: "Get seen",
    body: "Advertising campaigns can be drafted now. Checkout, verified-view rewards, and billboard counting stay off until funding is approved.",
  },
  {
    title: "Discover",
    body: "Members browse coins, follow traders, and open community profiles with a signed wallet.",
  },
  {
    title: "Practice",
    body: "Paper trading uses virtual SOL. It is not withdrawable, and it is not a live market order.",
  },
] as const;

export default function AboutPage() {
  return (
    <main id="main-content" className="gp-sol-page">
      <p className="gp-sol-eyebrow">GARMONPAY</p>
      <h1>Enter the Kingdom.</h1>
      <p className="gp-sol-muted max-w-3xl">GET SEEN. GET KNOWN. GET PAID. GarmonPay helps creators launch and promote a coin, and helps members discover projects, learn, play, and practice. Purchases, payouts, and Mainnet trading are paused.</p>
      <section className="gp-sol-grid gp-sol-section-space" aria-label="What GarmonPay does">
        {points.map((point) => (
          <article key={point.title} className="gp-sol-panel">
            <h2>{point.title}</h2>
            <p className="gp-sol-muted">{point.body}</p>
          </article>
        ))}
      </section>
      <section className="gp-sol-panel gp-sol-section-space">
        <h2>Wallet accounts</h2>
        <p className="gp-sol-muted">The new workspace uses Phantom, Solflare, Backpack, or another compatible Solana wallet. The wallet address is the account. Older email accounts stay in place and are not merged into the wallet profile.</p>
        <div className="gp-sol-actions mt-4">
          <Link className="gp-button gp-button-gold" href="/">Back to the Kingdom</Link>
          <Link className="gp-button" href="/solana/launchpad">Open Launchpad</Link>
          <Link className="gp-button" href="/member">Open Dashboard</Link>
        </div>
      </section>
    </main>
  );
}
