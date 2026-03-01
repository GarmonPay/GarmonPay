import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearerToken) {
    const supabase = createServerClient(bearerToken);
    await supabase?.auth.signOut().catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
