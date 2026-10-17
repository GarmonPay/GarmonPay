# Kingdom visual revision — incomplete animation candidate

Branch: garmonpay-kingdom-reference. Based on 79d760299b7654867f9f7f7ebd2ee9a7cc91095c.

## Implemented
- src/app/kingdom-site.css: larger sapphire crown display, icon-based desktop navigation, 250px glowing sidebar, foreground five-card row, gold headings and cyan framing; compact mobile rows retained.
- src/components/BrandCrown.tsx: additional gold points, trim and sapphire geometry for the interface logo only. The lion image is untouched.
- src/components/kingdom/home.tsx: Launch, Trade, Earn, Advertise, Community cards linked to existing destinations. Community uses an existing vector icon, not a matching bespoke illustration. Added an independent three-message local demonstration billboard and Pause/Resume control.

Existing hero image, lion, coin, energy effects, authenticated business logic and financial pauses preserved. No dependencies, media purchases, database changes, credentials or deployment configuration changes.

## Animation truth and missing assets
The billboard changes actual text content independently, every six seconds. It is presentation only: no paid advertisements, impressions, tracking or financial operation. Its CSS plane is approximate and requires final corner alignment against an approved screen plate. It stays to the right of the lion; no moving content crosses the lion. It is hidden on mobile because the portrait crop excludes most of that screen.

Existing city light/particle effects remain. Flying vehicles, moving road traffic and flowing waterfalls are NOT implemented. Public assets contain still city/lion composites and static card illustrations; no suitable separated motion plates, video or vehicle sprites were found. The world is not yet a genuinely animated scene.

Needed for faithful motion:
1. Camera-matched sky clean plate plus transparent flying-vehicle sprites or a rendered alpha loop, with flight paths and occlusion masks.
2. Road-region clean plate and traffic sprites/alpha loop, perspective scaled to the existing street and masked behind the lion and foreground objects. Existing still vehicles must not duplicate moving vehicles.
3. Seamless waterfall loops with alpha or region masks, matched to both visible waterfall regions, with mist and no edge seams.
4. Exact billboard corner coordinates/screen mask for desktop and a separately approved mobile framing if mobile billboard visibility is required.
5. Matching premium community illustration and, for a closer visual match, a detailed rendered interface crown. Current logo is vector art; it is not identical to the reference crown.

No missing media has been purchased or generated. The original approved screenshot is not replaced or used as a flattened functional page.

## Verification and limits
TypeScript and the 50 existing navigation/security checks passed. The final production build passed, including lint and type validation (existing image-optimization warnings remain). Desktop 1440px and mobile 390px inspected with no horizontal overflow. Mobile menu opens and Escape closes it; a bottom-navigation click successfully loads the real Launchpad page. Pause switches aria-pressed=true and pauses all scene CSS animations. Reduced-motion CSS disables existing effects, fixes the billboard to its first message and hides the unnecessary control; operating-system preference emulation was unavailable, so this was source verified rather than runtime emulated.

Performance: no new media downloads, animation libraries, per-frame JavaScript loops or timers. The billboard uses CSS opacity changes; existing glow effects remain. No device FPS, battery or Lighthouse claim is made. Real-device performance must be tested once motion assets exist. No authenticated wallet signatures or financial transactions were performed.

Screenshots: /Users/bishop/.codex/visualizations/2026/10/15/01a13d83-027a-7e33-aaf5-b953b1acc451/premium-kingdom-reference/revision-desktop-1440.png and revision-mobile-390.png.

## Release decision
Do not deploy this as a completed kingdom animation release. The requested independent vehicle, road and waterfall motion is blocked on assets, and the demonstration billboard needs final alignment approval. Production unchanged; no new deployment ID. Authorized Vercel deployment remains conditional on completion and successful checks. Rollback local candidate by reverting its dedicated commit; no database rollback required. Existing trading commit, stash and unrelated local script must remain untouched.
