import type { SupabaseClient } from "@supabase/supabase-js";

const pendingActions=new Map<string,string>();
function pendingActionId(key:string):string{
 let saved=pendingActions.get(key);try{saved=saved??sessionStorage.getItem(key)??undefined;}catch{/* partitioned storage */}
 const id=saved??crypto.randomUUID();pendingActions.set(key,id);try{sessionStorage.setItem(key,id);}catch{/* in-memory retry remains available */}return id;
}
function clearPendingAction(key:string){pendingActions.delete(key);try{sessionStorage.removeItem(key);}catch{/* storage unavailable */}}

const CELO_AUTH_ERR = "Session expired. Please log in again.";

const CELO_401_JSON = JSON.stringify({
  ok: false,
  error: CELO_AUTH_ERR,
});

/**
 * Refreshes the Supabase session when the access token is missing (common on
 * mobile / partitioned storage) and returns a valid JWT for `Authorization: Bearer`.
 */
function accessTokenLikelyExpired(session: {
  access_token?: string;
  expires_at?: number;
} | null): boolean {
  if (!session?.access_token) return true;
  const exp = session.expires_at;
  if (exp == null || !Number.isFinite(exp)) return false;
  const skewSec = 60;
  return exp * 1000 < Date.now() + skewSec * 1000;
}

export async function getFreshAccessToken(supabase: SupabaseClient): Promise<string> {
  const first = await supabase.auth.getSession();
  if (first.error) {
    console.log("[C-Lo Auth] getSession error (non-fatal)", first.error.message);
  }
  let session = first.data.session;
  if (session?.access_token && !accessTokenLikelyExpired(session)) {
    console.log("[C-Lo Auth] session exists", { fromCache: true });
    return session.access_token;
  }
  const refresh = await supabase.auth.refreshSession();
  if (refresh.error) {
    console.log("[C-Lo Auth] refreshSession error", refresh.error.message);
  }
  const second = await supabase.auth.getSession();
  if (second.error) {
    console.log("[C-Lo Auth] getSession error after refresh", second.error.message);
  }
  session = second.data.session ?? refresh.data.session;
  if (session?.access_token) {
    console.log("[C-Lo Auth] session exists", { fromCache: false });
    return session.access_token;
  }
  throw new Error(CELO_AUTH_ERR);
}

/**
 * Same-origin C-Lo API: always sends `Authorization: Bearer` after refreshing the session.
 * `credentials: "include"` keeps cookie sessions working where they exist.
 */
export async function fetchCeloApi(
  supabase: SupabaseClient,
  input: string,
  init: RequestInit
): Promise<Response> {
  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken(supabase);
  } catch (e) {
    console.log("[C-Lo API] auth failed (no access token after refresh)", {
      path: input,
    });
    return new Response(CELO_401_JSON, {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const h = new Headers(init.headers);
  h.set("Content-Type", "application/json");
  let actionKey:string|null=null;
  if ((init.method ?? "GET").toUpperCase() !== "GET" && !h.has("x-celo-request-id")){
    const {data}=await supabase.auth.getSession();
    actionKey=`celo-pending:${data.session?.user?.id??'session'}:${input}:${typeof init.body==='string'?init.body:''}`;
    h.set("x-celo-request-id",pendingActionId(actionKey));
  }
  h.set("Authorization", `Bearer ${accessToken}`);
  console.log("[C-Lo Auth] token sent", {
    path: input,
    tokenLength: accessToken.length,
  });

  const res = await fetch(input, { ...init, headers: h, credentials: "include" });
  if(actionKey){
    if(res.status>=400&&res.status<500)clearPendingAction(actionKey);
    else if(res.ok){try{await res.clone().json();clearPendingAction(actionKey);}catch{/* retain nonce until a readable server reply */}}
  }
  if (res.status === 401) {
    console.log("[C-Lo API] auth failed", { path: input, status: res.status });
  }
  return res;
}

export function alertCeloUnauthorized() {
  alert(CELO_AUTH_ERR);
}
