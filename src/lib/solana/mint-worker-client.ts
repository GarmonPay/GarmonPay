import { workerHeaders } from "./mint-worker-auth";
/** Server only. Neither the shared key nor worker address is sent to browsers. */
export async function mintWorker(body: Record<string, unknown>) {
  const address = process.env.GARMONPAY_MINT_WORKER_URL;
  const key = process.env.GARMONPAY_MINT_WORKER_KEY;
  if (!address || !key) throw new Error("The secure mint worker is offline. Your coin details are preserved; please retry later.");
  const url = new URL(address);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "127.0.0.1" && process.env.NODE_ENV !== "production")) throw new Error("Secure mint worker URL required");
  const payload = JSON.stringify(body);
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers: workerHeaders(payload, key), body: payload, signal: AbortSignal.timeout(body.action === "submit" ? 55000 : 40000), cache: "no-store", redirect: "error" }); }
  catch { throw new Error(body.action === "submit" ? "Mint worker confirmation was interrupted. Resume this launch to check its existing transaction before trying again." : "The secure mint worker is temporarily unreachable. Your coin details are preserved."); }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(typeof result.error === "string" ? result.error : "Mint worker request failed"), { code: result.code });
  return result;
}
