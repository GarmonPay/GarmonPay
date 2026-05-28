import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";

/**
 * Member ad engagement earning retired (wallet-cents path disabled).
 * Advertiser/garmon_ads admin code remains; earners use /api/earn/watch/*.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { engagementType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  if (!body.engagementType) {
    return NextResponse.json(
      { message: "adId and engagementType required" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      message:
        "Ad engagement earning is retired. Use Watch & Earn at /dashboard/earn (GPC only).",
    },
    { status: 410 }
  );
}
