import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { completeAdSessionAndIssueReward as completeDb } from "@/lib/ads-db";
import { recordActivity } from "@/lib/viral-db";
import { completeMission } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/ads/session/complete — complete session and issue reward. Production: Supabase only. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const { sessionId } = body;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ message: "sessionId required" }, { status: 400 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  try {
    const result = await completeDb(userId, sessionId);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (supabase) {
      try {
        // Keep withdrawable/aggregate counters in sync with ad rewards.
        const { data: walletRow } = await supabase
          .from("users")
          .select("withdrawable_balance, total_earnings, lifetime_earnings")
          .eq("id", userId)
          .maybeSingle();
        const currentWithdrawable = Number(
          (walletRow as { withdrawable_balance?: number } | null)?.withdrawable_balance ?? 0
        );
        const currentTotalEarnings = Number(
          (walletRow as { total_earnings?: number } | null)?.total_earnings ?? 0
        );
        const currentLifetimeEarnings = Number(
          (walletRow as { lifetime_earnings?: number } | null)?.lifetime_earnings ?? 0
        );
        await supabase
          .from("users")
          .update({
            withdrawable_balance: currentWithdrawable + result.rewardCents,
            total_earnings: currentTotalEarnings + result.rewardCents,
            lifetime_earnings: currentLifetimeEarnings + result.rewardCents,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        // Upsert ad earning metadata (ad_views + reward_amount) without duplicating rows.
        const { data: existingEarning } = await supabase
          .from("earnings")
          .select("id")
          .eq("user_id", userId)
          .eq("reference_id", sessionId)
          .maybeSingle();

        if (existingEarning?.id) {
          const richUpdate = await supabase
            .from("earnings")
            .update({
              source: "ad_view",
              reward_amount: result.rewardCents,
              ad_views: 1,
            })
            .eq("id", existingEarning.id);
          if (richUpdate.error) {
            await supabase
              .from("earnings")
              .update({ source: "ad" })
              .eq("id", existingEarning.id);
          }
        } else {
          const richInsert = await supabase.from("earnings").insert({
            user_id: userId,
            amount: result.rewardCents,
            source: "ad_view",
            reference_id: sessionId,
            reward_amount: result.rewardCents,
            ad_views: 1,
          });
          if (richInsert.error) {
            await supabase.from("earnings").insert({
              user_id: userId,
              amount: result.rewardCents,
              source: "ad",
              reference_id: sessionId,
            });
          }
        }
      } catch (syncErr) {
        console.error("Ad reward wallet/earnings sync error:", syncErr);
      }
    }

    recordActivity(userId, "earned", "Earned from ad", result.rewardCents).catch(() => {});
    completeMission(userId, "watch_ad").catch(() => {});
    return NextResponse.json({
      success: true,
      rewardCents: result.rewardCents,
      message: "Reward issued",
    });
  } catch (e) {
    console.error("Complete session error:", e);
    return NextResponse.json({ message: "Could not complete ad. Try again." }, { status: 503 });
  }
}
