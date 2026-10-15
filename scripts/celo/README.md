# Isolated C-Lo lifecycle verification

These scripts use a sanitized production schema, actual migration functions, fictitious users and local GPC only. Never point the fixture server or browser test at production or use production credentials.

The current QA runtime imports PGlite from `/private/tmp/garmonpay-phase1-db-validation/node_modules` and Playwright/ws from `/private/tmp/pwcelo/node_modules`. Install those packages in equivalent isolated directories or update the imports before rerunning on another machine. `schema-fixture.json` contains schema definitions only, with no user data or credentials.

Run `node scripts/celo/validate-lifecycle-db.mjs` for transaction/accounting/role tests. Start `local-lifecycle-server.mjs` and a Next server configured with fixture Supabase URL and dummy keys, then run `browser-lifecycle.mjs`. HTTPS uses a local self-signed certificate and a local proxy; certificate bypass is for this isolated localhost environment only. Browser requests to external hosts are blocked. Service workers are blocked because Chromium rejects localhost's self-signed certificate for worker registration; application API and game actions are not mocked.

The browser script uses two independent authenticated contexts, real Next endpoints, the actual SQL migration functions, and the existing TypeScript random dice evaluator. It checks client synchronization, concurrent controls, impersonation rejection, reveal timing, reload, chat and five viewport sizes. Random outcomes can vary the number of checks; database tests cover each deterministic outcome separately.
