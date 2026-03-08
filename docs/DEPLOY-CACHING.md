# Caching and deployment (GarmonPay)

## 1. Aggressive caching disabled

**next.config.mjs** sends `Cache-Control: no-store, max-age=0` on all responses (`/:path*`), so browsers and CDNs do not cache pages aggressively. API routes also send no-store via **vercel.json** headers.

## 2. Environment variables on deploy

- **Vercel:** Set env vars in **Project → Settings → Environment Variables** (Production / Preview as needed). `NEXT_PUBLIC_*` values are inlined at **build time**, so each new deployment uses the env vars currently set in the project.
- After changing env vars, trigger a **new deployment** (push to the connected branch or **Redeploy** in the Vercel dashboard) so the new build picks them up.

## 3. Force rebuild after deployment

- **vercel.json** sets `"buildCommand": "rm -rf .next && next build"` so every deploy does a clean Next.js build (no stale `.next` cache).
- For an extra-clean deploy: Vercel Dashboard → **Deployments** → **⋯** on the latest → **Redeploy** → enable **Clear build cache and redeploy**.
