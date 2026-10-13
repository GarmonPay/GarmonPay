/** Confirm the browser retained the HttpOnly cookie; never inspect or return its value. */
export async function confirmWalletSession(wallet: string, request: typeof fetch = fetch) {
 const response = await request('/api/solana/auth/session', {cache:'no-store',credentials:'same-origin'});
 const data = await response.json().catch(()=>({}));
 if (response.status >= 500) throw new Error("Sign-in session lookup is temporarily unavailable. [SESSION_LOOKUP]");
 if (response.ok && data.wallet && data.wallet !== wallet) throw new Error("The browser has a different wallet session. Retry sign-in. [SESSION_WALLET_CHANGED]");
 if (!response.ok || data.wallet !== wallet) throw new Error('The signature was approved, but this browser did not retain your sign-in session. Return to the same wallet browser and retry.');
}
