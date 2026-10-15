# C-Lo room and dice correction — October 4, 2026

The old renderer used flat face PNGs, mirrored PNG reflections and CSS rotations. It positioned dice using a 576×1024 photograph's coordinates, although the replacement photograph had different dimensions. The table also had an aspect ratio and maximum height, and an intermediate room wrapper did not fill its parent.

## Changes

- `src/components/celo/street/CeloDiceScene.tsx`: raw Three.js rounded dice, charcoal material, metallic gold pip meshes, shared lighting/environment reflections, textured felt and a shared shadow-receiving table. Final upward faces use supplied server values. Context failure leaves a readable numeric result.
- `src/components/celo/street/celo-dice-motion.ts`: presentation-only gravity, rebounds, conservative collision separation and rail bounds. Cube support height follows orientation to prevent table penetration; resting dice finish upright.
- `src/components/celo/street/celo-dice-motion.test.ts`: grounding/bounds and collision response tests.
- `src/components/celo/street/CeloFeltDice.tsx`: replaces flat-image rendering and obsolete photograph projection; retains the existing server-result lifecycle, visual lock and sound timing.
- `src/components/layout/DashboardLayout.tsx`: applies viewport sizing only inside C-Lo rooms; dashboard banners stay outside this immersive view.
- `src/app/design-system.css`: room height beneath navigation, expanding table, responsive chat placement and compact wager controls. Purple/gold branding and room artwork retained.
- `src/app/dashboard/games/celo/[roomId]/page.tsx`: one presentation class added to the wager card. Every action handler is unchanged.
- `scripts/ui/validate-celo-room.mjs`: local fixture-only responsive checks. All external services and financial writes are intercepted.

## Validation

- Frontend TypeScript check passed.
- 106 automated tests passed across 12 test files, including two new presentation-physics tests.
- Production build passed. Existing lint warnings remain.
- Waiting, player-turn and betting views checked at 390×844, 430×932, 1440×900 and 1920×1080.
- WebGL canvas present, room fills available viewport, no horizontal overflow, roll button visible and keyboard focusable, wager button above navigation and unobstructed at its click point.
- Screenshots visually reviewed on mobile and desktop.
- All 727 existing backend, API, financial-library and Supabase files match the pre-edit snapshot. The room page differs only by its wager-card CSS class.
- No production balances, wagers, charges, paid API operations or database migrations were used during testing.

## Compatibility and rollback

WebGL is required for the 3D preview. Numeric faces remain readable if the renderer is unavailable. Motion is a presentation simulation and cannot choose game outcomes. Existing reduced-motion timing is retained. Browser layout checks cover the common waiting, rolling-turn and betting states, not every possible administrative/error modal.

Recovery snapshot and local screenshots: `/Users/bishop/.codex/visualizations/2026/10/03/01a1028b-bcb6-7920-860f-989392c27925/GarmonPay-celo-correction-20261004/`. The archive contains private local configuration and must not be published.

Rollback: restore the previous frontend deployment `dpl_HK2wYZn8QgkzKousCf1DpQHtknT1` through Vercel. For local recovery, extract the archive into a separate directory and restore only the files listed above after review; do not overwrite unrelated work. No database rollback is required.

## Deployment

Release: `dpl_7y9MNmUv47Q4ehZbgTo9bQyqg1sp` — https://garmon-6wlv0i0ji-garmonpays-projects.vercel.app

Production alias verification and smoke-check results are recorded below when complete.

Deployment completed successfully. Vercel reports **Ready**, and inspecting `garmonpay.com` resolves to `dpl_7y9MNmUv47Q4ehZbgTo9bQyqg1sp`.

Post-deployment smoke checks passed: 36 browser/navigation checks at the four requested sizes, eight read-only API status checks and no browser errors. Authenticated room testing used local fixtures; no authenticated production game was played. No database migration was applied. Existing production environment variables were reused; no new secret or payment configuration is required.
