import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, ensureWalletBalancesRow } from "@/lib/wallet-ledger";

export type FraudCheckResult = {
  trustScore: number;
  flags: string[];
  action: "approve" | "review" | "reject" | "ban";
  shouldCredit: boolean;
};

const PLATFORM_SCREENSHOT_DOMAINS = [
  "imgur.com",
  "i.imgur.com",
  "prnt.sc",
  "prntscr.com",
  "gyazo.com",
  "lightshot.net",
  "drive.google.com",
  "dropbox.com",
  "ibb.co",
  "postimg.cc",
  "screenshots.com",
];

const SOCIAL_PLATFORM_DOMAINS = [
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "twitch.tv",
];

export async function runFraudChecks(params: {
  userId: string;
  taskId: string;
  completionId: string;
  proofUrl: string;
  proofRequired: boolean;
  submittedAt: string;
  claimedAt: string | null;
  platform: string;
  taskType: string;
}): Promise<FraudCheckResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      trustScore: 50,
      flags: ["supabase_unavailable"],
      action: "review",
      shouldCredit: false,
    };
  }

  let trustScore = 100;
  const flags: string[] = [];

  // ── CHECK 1: PROOF URL VALIDATION ──
  const proof = params.proofUrl?.trim() ?? "";
  if (params.proofRequired || proof.length > 0) {
    if (proof.length > 0) {
      try {
        const url = new URL(proof.startsWith("http") ? proof : `https://${proof}`);
        const domain = url.hostname.replace(/^www\./, "");

        const isScreenshotDomain = PLATFORM_SCREENSHOT_DOMAINS.some((d) => domain.includes(d));
        const isSocialDomain = SOCIAL_PLATFORM_DOMAINS.some((d) => domain.includes(d));

        if (isSocialDomain) {
          trustScore -= 30;
          flags.push("proof_is_social_url_not_screenshot");
        }

        if (!isScreenshotDomain && !isSocialDomain) {
          trustScore -= 20;
          flags.push("proof_unknown_domain");
        }

        if (proof.length < 10) {
          trustScore -= 50;
          flags.push("proof_url_too_short");
        }
      } catch {
        trustScore -= 40;
        flags.push("proof_url_invalid");
      }
    } else {
      trustScore -= 40;
      flags.push("proof_url_invalid");
    }
  }

  // ── CHECK 2: SUBMISSION TIMING ──
  if (params.claimedAt) {
    const claimedTime = new Date(params.claimedAt).getTime();
    const submittedTime = new Date(params.submittedAt).getTime();
    if (Number.isFinite(claimedTime) && Number.isFinite(submittedTime)) {
      const secondsElapsed = (submittedTime - claimedTime) / 1000;
      if (secondsElapsed < 15) {
        trustScore -= 50;
        flags.push("submitted_too_fast");
      } else if (secondsElapsed < 30) {
        trustScore -= 25;
        flags.push("submitted_very_fast");
      } else if (secondsElapsed < 60) {
        trustScore -= 10;
        flags.push("submitted_fast");
      }
    }
  }

  // ── CHECK 3: DUPLICATE PROOF URL ──
  if (proof.length > 0) {
    const { data: duplicateProof } = await supabase
      .from("social_task_completions")
      .select("id, user_id")
      .eq("proof_url", proof)
      .neq("id", params.completionId)
      .limit(1);

    if (duplicateProof && duplicateProof.length > 0) {
      trustScore -= 100;
      flags.push("duplicate_proof_url");
    }
  }

  // ── CHECK 4: DAILY TASK LIMIT ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from("social_task_completions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .gte("completed_at", today.toISOString());

  const { data: userRow } = await supabase.from("users").select("membership").eq("id", params.userId).maybeSingle();

  const tier = ((userRow as { membership?: string } | null)?.membership ?? "free").toLowerCase();
  const dailyLimits: Record<string, number> = {
    free: 3,
    starter: 10,
    growth: 25,
    pro: 50,
    elite: 999,
  };
  const limit = dailyLimits[tier] ?? 3;

  if ((todayCount ?? 0) > limit * 1.5) {
    trustScore -= 40;
    flags.push("exceeds_daily_limit");
  }

  // ── CHECK 5: ACCOUNT AGE ──
  const { data: userAccount } = await supabase.from("users").select("created_at").eq("id", params.userId).maybeSingle();

  if (userAccount) {
    const created = (userAccount as { created_at?: string }).created_at;
    if (created) {
      const accountAge = Date.now() - new Date(created).getTime();
      const hoursOld = accountAge / (1000 * 60 * 60);
      if (hoursOld < 1) {
        trustScore -= 40;
        flags.push("account_under_1_hour");
      } else if (hoursOld < 24) {
        trustScore -= 20;
        flags.push("account_under_24_hours");
      }
    }
  }

  // ── CHECK 6: STRIKE HISTORY ──
  const { data: fraudRows } = await supabase
    .from("social_fraud_flags")
    .select("id")
    .eq("user_id", params.userId)
    .eq("resolved", false);

  const strikes = (fraudRows ?? []).length;
  if (strikes >= 3) {
    trustScore -= 50;
    flags.push("multiple_existing_strikes");
  } else if (strikes === 2) {
    trustScore -= 25;
    flags.push("two_existing_strikes");
  } else if (strikes === 1) {
    trustScore -= 10;
    flags.push("one_existing_strike");
  }

  // ── CHECK 7: RAPID MULTI-TASK PATTERN ──
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("social_task_completions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .gte("completed_at", tenMinutesAgo);

  if ((recentCount ?? 0) >= 5) {
    trustScore -= 30;
    flags.push("bot_like_pattern");
  }

  // ── DETERMINE ACTION ──
  let action: FraudCheckResult["action"];
  if (trustScore >= 85) {
    action = "approve";
  } else if (trustScore >= 60) {
    action = "review";
  } else if (trustScore >= 30) {
    action = "reject";
  } else {
    action = "ban";
  }

  // ── LOG FRAUD FLAGS (internal) ──
  if (flags.length > 0 && trustScore < 85) {
    const { error: insFlagErr } = await supabase.from("social_fraud_flags").insert({
      user_id: params.userId,
      task_id: params.taskId,
      completion_id: params.completionId,
      reason: flags.join(", "),
      severity: trustScore < 30 ? "high" : trustScore < 60 ? "medium" : "low",
      auto_detected: true,
      resolved: false,
    });
    if (insFlagErr) console.error("[social-fraud] insert flag:", insFlagErr.message);
  }

  const verificationStatus =
    action === "approve"
      ? "verified"
      : action === "ban" || action === "reject"
        ? "flagged"
        : "pending_review";

  const completionStatus =
    action === "approve" ? "pending" : action === "review" ? "pending" : "rejected";

  const { error: upErr } = await supabase
    .from("social_task_completions")
    .update({
      trust_score: trustScore,
      flagged: trustScore < 60,
      flag_reason: flags.length > 0 ? flags.join(", ") : null,
      verification_status: verificationStatus,
      status: completionStatus,
    })
    .eq("id", params.completionId);

  if (upErr) console.error("[social-fraud] update completion:", upErr.message);

  return {
    trustScore,
    flags,
    action,
    shouldCredit: action === "approve",
  };
}

export async function reverifyCompletion(params: {
  completionId: string;
  userId: string;
  taskId: string;
  proofUrl: string;
  platform: string;
}): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase || !params.proofUrl?.trim()) return;

  try {
    const response = await fetch(params.proofUrl.trim(), {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 404) {
      await supabase
        .from("social_task_completions")
        .update({
          verification_status: "clawed_back",
          flagged: true,
          flag_reason: "proof_deleted_possible_unfollow",
        })
        .eq("id", params.completionId);

      await supabase.from("social_fraud_flags").insert({
        user_id: params.userId,
        task_id: params.taskId,
        completion_id: params.completionId,
        reason: "Proof URL deleted after approval - possible unfollow/unlike",
        severity: "medium",
        auto_detected: true,
        resolved: false,
      });

      const { error: rpcErr } = await supabase.rpc("increment_social_strikes", {
        p_user_id: params.userId,
      });
      if (rpcErr) console.error("[social-fraud] increment_social_strikes:", rpcErr.message);

      const { data: completion } = await supabase
        .from("social_task_completions")
        .select("reward_cents")
        .eq("id", params.completionId)
        .maybeSingle();

      const reward = Number((completion as { reward_cents?: number } | null)?.reward_cents ?? 0);
      if (reward > 0) {
        const ensured = await ensureWalletBalancesRow(params.userId);
        if (!ensured.ok) {
          console.error("[social-fraud] ensureWalletBalancesRow:", ensured.message);
          return;
        }
        const claw = await walletLedgerEntry(
          params.userId,
          "admin_adjustment",
          -reward,
          `claw_back_${params.completionId}`
        );
        if (!claw.success) console.error("[social-fraud] clawback:", claw.message);
      }
    }
  } catch {
    // Transient network / TLS — do not penalize
  }
}
