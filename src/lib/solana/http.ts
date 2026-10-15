import { NextResponse } from "next/server";
import { authOrigin } from "./auth-crypto";
export function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export function sameOrigin(request: Request) { return request.headers.get("origin") === authOrigin(); }
export function trustedBrowserOrigin(request: Request) {
  if (sameOrigin(request)) return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    if (url.host !== host) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}
export async function smallJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON required");
  const reader = request.body?.getReader(); if (!reader) throw new Error("Body required");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); throw new Error("Request too large"); } chunks.push(value); }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request");
  return parsed;
}
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
/** Lax keeps the cookie on Phantom's top-level return without allowing cross-site POST. */
export const walletCookieOptions = { ...cookieOptions, sameSite: "lax" as const };
