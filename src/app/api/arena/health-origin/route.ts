import { NextResponse } from "next/server";
import { getFightServerHealthUrl } from "@/lib/fight-server-config";
export const dynamic = "force-dynamic";
/** Public origin only: no provider account data, credentials or worker mutations. */
export async function GET() {
  return NextResponse.json({ healthOrigin: getFightServerHealthUrl() ?? null }, { headers: { "Cache-Control": "no-store" } });
}
