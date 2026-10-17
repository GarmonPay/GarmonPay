# Kingdom city motion release — October 17, 2026

## Verified resume and preservation
Resumed garmonpay-kingdom-reference at 01d1d81e5cd0d9390afe0c70432e2af118d67289 with existing local motion work, without reset or duplicated animation systems. Source lion JPG, crown component, authentication, business logic, financial pauses, trading safeguards, database schemas and deployment configuration remain unchanged. Stash 1add02e9580de057d73531d2d4d999d1b087cfd7, trading commit 3900614, member worktree and unrelated scripts/tmp-fox-scan.mts preserved.

Production before this release: Ready deployment dpl_ARC7SHJZSQTFsYQphtP4d5KQhU43 at https://garmonpay.com. No interrupted local work had been deployed.

## Changes
- src/components/kingdom/CityMotion.tsx: the right billboard interior is one opaque glass screen. One message is visible at a time. Painted cars, aircraft, and waterfalls are not covered by a second drawing.
- Vector aircraft, road cars, and waterfall strokes from the first motion pass are not rendered. Those layers sat on top of the same objects in the painting.
- public/images/kingdom/cards/community.svg: sapphire-and-gold community illustration replacing the outline placeholder.
- src/components/kingdom/home.tsx: integrate motion in the existing scene stage; reuse Pause; add Reduced motion; suspend animations outside viewport/hidden document with a cleaned-up observer/listener. No per-frame JavaScript loop.
- src/app/kingdom-site.css: independent motion paths, water flow, billboard changes, pause/reduced-motion rules, larger desktop branding and sidebar icons, sidebar clearance, mobile image/stage alignment.

The existing screen scan is retained on the left billboard, which keeps its single painted message. Existing sky glints and energy effects retained. No animation or cinematic scene is introduced on interior pages.

## Quality and limits
The interface is functional HTML/React, not the reference flattened into a page. The lion image and its composition are unchanged. The right screen hides the painted GARMONPAY graphic before showing a replacement message, so two headlines are not stacked.

Painted road vehicles, painted aircraft, and painted waterfalls remain the only versions of those objects. Cutting them out of locked-hero.jpg left visible sky, plaza, and mask scars, so separate flying craft, traffic, and flowing-water plates were not added. The unused cruiser and coupe vectors remain on disk and are not rendered.

Desktop billboard cycles only local GarmonPay, discovery and community messages, without ad delivery, tracking or fake financial claims. Future real advertisements require a separately approved content pipeline. No new financial feature is enabled. Mobile keeps the portrait lion crop. The right screen is outside that crop, so the portrait shows the painted city, including its own waterfall, without a second water layer.

## Verification
- 50 navigation/authorization-pause tests passed across five suites.
- TypeScript and production build passed, including lint and type validation. Existing image-optimization warnings remain.
- 1440px desktop and 390px mobile inspected with document width matching viewport; mobile motion stage and source image both 410px high.
- The conflicting aircraft, traffic, and waterfall overlays are not rendered. The right screen shows one message on an opaque glass fill.
- Pause freezes the scene. Reduced motion keeps the first billboard message still. OS preference is enforced in CSS.
- Keyboard navigation to the mobile footer makes data-scene-visible=false and animation-play-state=paused.
- Mobile menu opens, Escape closes it; existing wallet chooser displays Phantom, Solflare and Backpack. No wallet signature or transaction requested.
- Launchpad, trade, discovery, advertise, earn, member dashboard, paper, referrals, community and games inspected at 390px: one shared navigation header, no horizontal overflow, no city motion on interior routes.
- Built-route HTTP checks: homepage and eight core destinations returned 200; anonymous session 401; admin users 403; funding and advertising checkout 503. Snapshot confirms financialOperationsPaused=true, paymentEnabled=false, payoutsEnabled=false.
- Local built routes responded in 37–96ms during a parallel local smoke check; this is not an Internet or real-device performance measurement.
- Three new SVG media files total 3,330 bytes before compression. No animation library, dependency, video decoding or per-frame JavaScript added. No hardware FPS/battery guarantee is made; real-device profiling remains useful.

## Deployment and rollback
Deploy only the committed UI candidate with the existing Vercel project and environment. Upload excludes environment files, Git metadata, unapproved design attempts and unrelated temporary scripts. No database migration or configuration change. Verify Ready status, garmonpay.com alias, live source image, motion controls, routes and financial pauses after deployment. Prior deployment above is the application rollback target if rendering, auth entry, navigation or financial pause checks regress. No database rollback is needed. Deployment ID and live verification evidence are reported in the conversation after completion.
