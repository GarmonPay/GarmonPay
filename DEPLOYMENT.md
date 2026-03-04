# GarmonPay – Production deployment (GitHub + Vercel)

## Prerequisites

- Node.js 18+
- GitHub account
- Vercel account
- Supabase and Stripe projects configured

## 1. Build and run locally

```bash
npm install
npm run build
npm run start
```

## 2. Push to GitHub (main branch)

From the project root:

```bash
# Ensure you're on main
git checkout main

# Stage all changes (including .gitignore, vercel.json, .env.example)
git add .
git status

# Commit
git commit -m "chore: production-ready for Vercel (gitignore, vercel.json, .env.example, webhook security)"

# If no remote yet, add origin (replace with your repo URL):
# git remote add origin https://github.com/YOUR_USERNAME/GarmonPay.git

# Push to GitHub
git push -u origin main
```

## 3. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. **Import** your GitHub repository (e.g. `GarmonPay`).
3. **Configure:**
   - Framework Preset: **Next.js** (auto-detected).
   - Root Directory: **./** (leave default).
   - Build Command: `npm run build`.
   - Output Directory: `.next` (default).
4. **Environment variables** (Settings → Environment Variables). Add from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `ADMIN_SETUP_SECRET` (production only)
   - Optional: `NEXT_PUBLIC_SITE_URL` = `https://your-app.vercel.app`
5. **Deploy**. Vercel will run `npm install` and `npm run build`.

## 4. Post-deploy

- **Stripe webhooks:** In Stripe Dashboard → Webhooks, add endpoint  
  **`https://garmonpay.com/api/stripe/webhook`**  
  (or `https://your-app.vercel.app/api/stripe/webhook` for other domains).  
  Set `STRIPE_WEBHOOK_SECRET` in Vercel to the signing secret.
- **Supabase:** Allow your Vercel domain in Supabase Auth URL settings if required.

## Branch

Production branch: **main**. Pushes to `main` trigger production deployments on Vercel when the repo is connected.

---

## Exact terminal commands to push to GitHub

Run these from the project root (`/Users/bishop/Desktop/GarmonPay` or your repo path):

```bash
# 1. Ensure you're on main
git checkout main

# 2. Stage all files (new: .gitignore, vercel.json, .env.example, DEPLOYMENT.md; updated: stripe webhook)
git add .gitignore vercel.json .env.example DEPLOYMENT.md src/app/api/stripe/webhook/route.ts
# Or stage everything: git add .

# 3. Commit
git commit -m "chore: production-ready for Vercel - gitignore, vercel.json, .env.example, webhook signature verification"

# 4. If you haven't added a remote yet (replace YOUR_USERNAME and REPO with your GitHub repo):
#    git remote add origin https://github.com/YOUR_USERNAME/REPO.git

# 5. Push to GitHub (creates/updates main on origin)
git push -u origin main
```

After pushing, connect the repo in Vercel and add the environment variables from `.env.example`.
