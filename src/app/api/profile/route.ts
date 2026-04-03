import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient, createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

/** Display name: length and charset (no control chars). */
const MAX_FULL_NAME_LEN = 120;
/** Public avatar URL (https only recommended). */
const MAX_AVATAR_URL_LEN = 2000;
/** Rolling window for profile edits (member abuse limit). */
const PROFILE_EDIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
/** Max successful profile updates per user per window. */
const PROFILE_EDITS_PER_HOUR = 8;

function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function isSafeAvatarUrl(raw: string): boolean {
  const u = raw.trim();
  if (u.length === 0) return true;
  if (u.length > MAX_AVATAR_URL_LEN) return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") return false;
  return true;
}

/**
 * GET /api/profile — current user’s public profile fields (Bearer required).
 */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let emailFallback = "";
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearer) {
    const server = createServerClient(bearer);
    if (server) {
      const { data: { user } } = await server.auth.getUser(bearer);
      emailFallback = user?.email ?? "";
    }
  }

  const { data: row, error } = await admin
    .from("users")
    .select("id, email, full_name, avatar_url, membership, referral_code")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profile GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const r = row as {
    id?: string;
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    membership?: string | null;
    referral_code?: string | null;
  } | null;

  return NextResponse.json({
    id: userId,
    email: r?.email ?? emailFallback,
    full_name: typeof r?.full_name === "string" ? r.full_name : "",
    avatar_url: typeof r?.avatar_url === "string" ? r.avatar_url : "",
    membership: typeof r?.membership === "string" ? r.membership : null,
    referral_code: typeof r?.referral_code === "string" ? r.referral_code : null,
    limits: {
      maxFullNameLen: MAX_FULL_NAME_LEN,
      maxAvatarUrlLen: MAX_AVATAR_URL_LEN,
      editsPerHour: PROFILE_EDITS_PER_HOUR,
    },
  });
}

/**
 * PATCH /api/profile — update display name and avatar URL only (Bearer required).
 * Rate limited: PROFILE_EDITS_PER_HOUR per rolling hour per user.
 */
export async function PATCH(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { full_name?: unknown; avatar_url?: unknown };
  const updates: Record<string, string | null> = {};

  if ("full_name" in b) {
    if (b.full_name !== null && typeof b.full_name !== "string") {
      return NextResponse.json({ error: "full_name must be a string or null" }, { status: 400 });
    }
    if (b.full_name === null || b.full_name === "") {
      updates.full_name = null;
    } else {
      const name = stripControlChars(b.full_name);
      if (name.length > MAX_FULL_NAME_LEN) {
        return NextResponse.json(
          { error: `Display name must be at most ${MAX_FULL_NAME_LEN} characters` },
          { status: 400 }
        );
      }
      updates.full_name = name.length === 0 ? null : name;
    }
  }

  if ("avatar_url" in b) {
    if (b.avatar_url !== null && typeof b.avatar_url !== "string") {
      return NextResponse.json({ error: "avatar_url must be a string or null" }, { status: 400 });
    }
    const raw = b.avatar_url === null || b.avatar_url === "" ? "" : String(b.avatar_url).trim();
    if (raw && !isSafeAvatarUrl(raw)) {
      return NextResponse.json(
        {
          error:
            "Avatar URL must be empty or a valid http(s) URL",
        },
        { status: 400 }
      );
    }
    updates.avatar_url = raw.length === 0 ? null : raw;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No allowed fields to update. Send full_name and/or avatar_url." },
      { status: 400 }
    );
  }

  const rl = checkRateLimit(userId, "profile:member-edit", PROFILE_EDITS_PER_HOUR, PROFILE_EDIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Profile update limit reached. Try again later.",
        retryAfterSec: rl.retryAfterSec,
        limitPerHour: PROFILE_EDITS_PER_HOUR,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          "X-RateLimit-Limit": String(PROFILE_EDITS_PER_HOUR),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await admin
    .from("users")
    .update(payload)
    .eq("id", userId)
    .select("id, email, full_name, avatar_url, membership, referral_code")
    .maybeSingle();

  if (error) {
    console.error("[profile PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Profile row not found. Complete signup or contact support." },
      { status: 404 }
    );
  }

  const u = updated as {
    email?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    membership?: string | null;
    referral_code?: string | null;
  };

  return NextResponse.json({
    ok: true,
    profile: {
      id: userId,
      email: u.email ?? "",
      full_name: typeof u.full_name === "string" ? u.full_name : "",
      avatar_url: typeof u.avatar_url === "string" ? u.avatar_url : "",
      membership: u.membership ?? null,
      referral_code: u.referral_code ?? null,
    },
    remainingEditsThisHour: rl.remaining,
    limitPerHour: PROFILE_EDITS_PER_HOUR,
  });
}
