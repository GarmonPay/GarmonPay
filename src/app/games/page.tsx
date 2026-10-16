import Link from "next/link";
import { GameCatalog } from "@/components/ui/GameCatalog";
import { PageHeading } from "@/components/ui/garmon-ui";

const notes = [
  { href: "/solana/earn", title: "Rewards", text: "Watch & Earn opens when a campaign is funded. No reward balance is shown until it is reconciled." },
  { href: "/dashboard/arena/tournaments", title: "Contests", text: "Existing tournament boards stay in the account arena. Paid entry and prize payouts are off." },
  { href: "/member/paper", title: "Paper trading", text: "Practice with virtual SOL. It is not a contest prize and it cannot be withdrawn." },
] as const;

export default function GamesPage() {
  return (
    <div className="gp-lobby-page space-y-4">
      <PageHeading eyebrow="GARMONPAY / PLAY" title="The game collection" description="Play a free practice game, or open an existing account game. Wagers stay off." />
      <section className="gp-sol-panel">
        <p className="gp-sol-eyebrow">PLAY NOW / NO ACCOUNT NEEDED</p>
        <h2>Connect Four practice</h2>
        <p className="gp-sol-muted">Challenge someone beside you. Take turns on the same device and connect four to win. Free play with no entry fee or prize.</p>
        <Link className="gp-button gp-button-gold gp-sol-section-space" href="/games/connect-four">Play free Connect Four</Link>
      </section>
      <section className="gp-sol-grid" aria-label="Related Kingdom areas">
        {notes.map((note) => (
          <Link key={note.href} href={note.href} className="gp-sol-panel">
            <h2>{note.title}</h2>
            <p className="gp-sol-muted">{note.text}</p>
          </Link>
        ))}
      </section>
      <GameCatalog />
    </div>
  );
}
