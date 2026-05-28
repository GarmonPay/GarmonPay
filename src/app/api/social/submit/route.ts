import { NextResponse } from "next/server";

/** Social task earning retired — watch-only GPC earn. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Social tasks are retired. Earn GPC by watching creator videos at /dashboard/earn.",
    },
    { status: 410 }
  );
}
