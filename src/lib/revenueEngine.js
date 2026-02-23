export async function processAdRevenue(supabase, userId, adValue) {
  const platformPercent = 0.6;
  const userPercent = 0.4;

  const platformAmount = adValue * platformPercent;
  const userAmount = adValue * userPercent;

  await supabase.from("earnings").insert({
    user_id: userId,
    amount: adValue,
    platform_fee: platformAmount,
    user_amount: userAmount,
  });

  await supabase.from("platform_revenue").insert({
    amount: platformAmount,
    source: "ad_view",
  });

  return {
    userAmount,
    platformAmount,
  };
}
