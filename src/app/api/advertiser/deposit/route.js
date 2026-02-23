import { createAdminClient } from "@/lib/supabase";

export async function POST(req) {
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
