import { readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { KingdomButton } from "@/components/kingdom/button";
import { KingdomCard } from "@/components/kingdom/card";
import { KingdomField, KingdomForm } from "@/components/kingdom/field";
import { KingdomNav } from "@/components/kingdom/nav";
import { KingdomShell } from "@/components/kingdom/shell";
import { KingdomStatus } from "@/components/kingdom/status";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "GarmonPay design preview",
  robots: { index: false, follow: false },
};

const publicNav = [
  { id: "home", label: "Home", current: true },
  { id: "launchpad", label: "Launchpad" },
  { id: "trade", label: "Trade" },
  { id: "advertise", label: "Advertise" },
  { id: "watch", label: "Watch & Earn" },
] as const;

const memberNav = [
  { id: "overview", label: "Overview", current: true },
  { id: "wallet", label: "My Wallet" },
  { id: "profile", label: "My Profile" },
  { id: "rewards", label: "My Rewards" },
] as const;

const adminNav = [
  { id: "overview", label: "Overview", current: true },
  { id: "members", label: "Members" },
  { id: "campaigns", label: "Campaigns" },
  { id: "audit", label: "Audit" },
] as const;

export default function KingdomDesignPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) notFound();
  const css = readFileSync(path.join(process.cwd(), "src/design/kingdom/tokens.css"), "utf8");
  return (
    <div className="gp-kingdom-stage">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <KingdomShell
        nav={<KingdomNav label="Sample public navigation" items={publicNav} />}
        action={<KingdomButton type="button">Connect Wallet<span className="gp-kingdom-sr">Sample control. This preview does not connect a wallet.</span></KingdomButton>}
      >
        <section className="gp-kingdom-hero" aria-labelledby="kingdom-preview-title">
          <p className="gp-kingdom-kicker">Design system specimen</p>
          <h1 id="kingdom-preview-title">One kingdom. One visual system.</h1>
          <p className="gp-kingdom-slogan">GET SEEN. GET KNOWN. GET PAID.</p>
          <p className="gp-kingdom-copy">These are component samples for the purple-and-gold application. The cinematic homepage is unchanged. Nothing on this page is a live balance, price, or member record.</p>
          <div className="gp-kingdom-row">
            <KingdomButton>Primary action</KingdomButton>
            <KingdomButton variant="secondary">Secondary action</KingdomButton>
            <KingdomButton variant="ghost">Quiet action</KingdomButton>
            <KingdomButton disabled>Disabled</KingdomButton>
          </div>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="states-title">
          <h2 id="states-title">Status</h2>
          <div className="gp-kingdom-row">
            <KingdomStatus tone="working">Working</KingdomStatus>
            <KingdomStatus tone="paused">Paused</KingdomStatus>
            <KingdomStatus tone="incomplete">Incomplete</KingdomStatus>
            <KingdomStatus tone="planned">Planned</KingdomStatus>
            <KingdomStatus tone="success">Confirmed</KingdomStatus>
            <KingdomStatus tone="warning">Review</KingdomStatus>
            <KingdomStatus tone="danger">Failed</KingdomStatus>
            <KingdomStatus tone="info">Info</KingdomStatus>
          </div>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="wallet-title">
          <h2 id="wallet-title">Sample wallet states</h2>
          <div className="gp-kingdom-row">
            <KingdomStatus tone="planned">Disconnected</KingdomStatus>
            <KingdomStatus tone="warning">Pending signature</KingdomStatus>
            <KingdomStatus tone="success">Connected</KingdomStatus>
            <KingdomStatus tone="danger">Signature failed</KingdomStatus>
          </div>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="cards-title">
          <h2 id="cards-title">Cards</h2>
          <div className="gp-kingdom-grid gp-kingdom-grid-3">
            <KingdomCard eyebrow="Token" title="Sample coin card">
              <p className="gp-kingdom-copy">A future token card uses the real coin name, ticker, and artwork. This specimen has no market data.</p>
            </KingdomCard>
            <KingdomCard eyebrow="Advertising" title="Sample campaign card">
              <p className="gp-kingdom-copy">Campaign setup stays a later step. Prices and view packages are not shown here.</p>
              <KingdomStatus tone="paused">Funding paused</KingdomStatus>
            </KingdomCard>
            <KingdomCard eyebrow="Member" title="Sample profile card">
              <p className="gp-kingdom-copy">Profiles stay tied to a signed wallet. No member record is loaded in this preview.</p>
            </KingdomCard>
          </div>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="nav-title">
          <h2 id="nav-title">Navigation groups</h2>
          <div className="gp-kingdom-grid gp-kingdom-grid-2">
            <KingdomCard eyebrow="Member" title="Member shell">
              <KingdomNav label="Sample member navigation" items={memberNav} />
            </KingdomCard>
            <KingdomCard eyebrow="Admin" title="Admin shell">
              <p className="gp-kingdom-copy">Generic admin styling only. This preview has no admin access and shows no operational records.</p>
              <KingdomNav label="Sample admin navigation" items={adminNav} />
            </KingdomCard>
          </div>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="form-title">
          <h2 id="form-title">Form</h2>
          <KingdomCard title="Sample field states">
            <KingdomForm label="Sample campaign name form">
              <KingdomField label="Campaign name" name="sample-name" hint="Sample field. Nothing is saved." maxLength={80} />
              <KingdomField label="Destination" name="sample-url" error="Sample error: enter an HTTPS destination." defaultValue="not-a-url" />
              <KingdomField label="Notes" name="sample-notes" disabled hint="Disabled sample." />
              <div className="gp-kingdom-row">
                <KingdomButton type="submit">Review sample</KingdomButton>
              </div>
            </KingdomForm>
          </KingdomCard>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="table-title">
          <h2 id="table-title">Table</h2>
          <div className="gp-kingdom-table-wrap">
            <table className="gp-kingdom-table">
              <caption className="gp-kingdom-sr">Sample status labels, not live platform records</caption>
              <thead>
                <tr>
                  <th scope="col">Sample</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Route specimen</td>
                  <td>An existing page can later wear this shell.</td>
                  <td><KingdomStatus tone="working">Working</KingdomStatus></td>
                </tr>
                <tr>
                  <td>Funding specimen</td>
                  <td>Financial operations stay paused.</td>
                  <td><KingdomStatus tone="paused">Paused</KingdomStatus></td>
                </tr>
                <tr>
                  <td>Contest specimen</td>
                  <td>No contest route exists yet.</td>
                  <td><KingdomStatus tone="planned">Planned</KingdomStatus></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="gp-kingdom-section" aria-labelledby="feedback-title">
          <h2 id="feedback-title">Feedback</h2>
          <div className="gp-kingdom-grid gp-kingdom-grid-3">
            <div className="gp-kingdom-empty" role="status">
              <h3>Empty</h3>
              <p className="gp-kingdom-copy">No eligible records yet. This sample does not invent any.</p>
            </div>
            <div className="gp-kingdom-card" role="status" aria-busy="true" aria-label="Loading sample">
              <h3>Loading</h3>
              <div className="gp-kingdom-loading" />
            </div>
            <div className="gp-kingdom-error-panel" role="alert">
              <h3>Error</h3>
              <p className="gp-kingdom-copy">Sample failure. No request was sent.</p>
            </div>
          </div>
        </section>
      </KingdomShell>
    </div>
  );
}
