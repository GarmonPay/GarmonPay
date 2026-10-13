import { NextResponse } from "next/server";
import { authOrigin } from "./auth-crypto";
export function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export function sameOrigin(request: Request) { return request.headers.get("origin") === authOrigin(); }
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
