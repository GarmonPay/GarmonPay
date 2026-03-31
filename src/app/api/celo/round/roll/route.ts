"use server";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "CELO round roll is not configured yet." },
    { status: 501 }
  );
}
