# Deploy Fight Server to Render (24/7)

1. **Push `render.yaml`**  
   Ensure `render.yaml` is in the repo root and committed.

2. **Create the service on Render**  
   - Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.  
   - Connect your GitHub/GitLab repo and select the GarmonPay repo.  
   - Render will detect `render.yaml` and create the **garmonpay-fight-server** web service.  
   - Confirm and deploy.

3. **Environment variables on Render**  
   In the service → **Environment**:  
   - **CORS_ORIGIN** is set to `*` by the blueprint (allows any origin for WebSocket).  
   - For wallet/Supabase: add **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** (same values as your main app).

4. **Service URL**  
   After deploy, the service will be at:  
   **https://garmonpay-fight-server.onrender.com**  
   (or the custom subdomain you set). WebSocket uses **wss://** on the same host.

5. **Frontend env**  
   Set in Vercel (Production/Preview) and in `.env.local` for local dev:  
   ```bash
   NEXT_PUBLIC_BOXING_WS_URL=wss://garmonpay-fight-server.onrender.com
   ```

6. **Restart Next.js**  
   - **Local:** Restart the dev server after changing env (`npm run dev`).  
   - **Vercel:** Redeploy the app after setting the env var so the client uses the new URL.

CORS is configured to allow any origin (`*`), so WebSocket connections from garmonpay.com and localhost will work.
