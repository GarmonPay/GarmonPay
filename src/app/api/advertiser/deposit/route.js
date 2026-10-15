import { createAdminClient } from "@/lib/supabase";

async function legacyDeposit(req) {
  const body = await req.json();

  const supabase = createAdminClient();
  if (!supabase) {
    return Response.json({ success: false, error: "Server not configured" }, { status: 500 });
  }

  await supabase
    .from("advertisers")
    .update({
      balance: body.amount,
    })
    .eq("email", body.email);

  return Response.json({ success: true });
}

/** Disabled: balances may only be credited by the verified payment flow. */
export async function POST() {
  return Response.json({ success: false, error: "Direct balance deposits are disabled" }, { status: 410 });
}
