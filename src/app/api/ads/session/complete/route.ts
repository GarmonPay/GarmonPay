import { NextResponse } from "next/server";

/** Legacy public.ads watch flow removed. */
export async function POST() {
  return NextResponse.json(
    { message: "Legacy ad sessions are retired. Use /dashboard/earn." },
    { status: 410 }
  );
}
