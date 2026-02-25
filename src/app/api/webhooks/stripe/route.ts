import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "Webhook endpoint is live"
  });
}

export async function POST() {
  return NextResponse.json({
    received: true
  });
}
