import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { HttpError } from "../lib/http-error";
import { getServiceClient } from "./supabase.service";

const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

export interface AuthResponsePayload {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
}

export async function registerWithEmailPassword(email: string, password: string): Promise<AuthResponsePayload> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await authClient.auth.signUp({
    email: normalizedEmail,
    password
  });

  if (error) {
    throw new HttpError(400, error.message);
  }

  if (!data.user) {
    throw new HttpError(500, "Unable to create user");
  }

  const session = data.session;
  if (!session) {
    throw new HttpError(
      409,
      "Registration succeeded but email confirmation is required before login"
    );
  }

  const service = getServiceClient();
  await service
    .from("users")
    .upsert(
      {
        id: data.user.id,
        email: normalizedEmail,
        role: "user",
        is_super_admin: false
      },
      { onConflict: "id" }
    );

  return {
    user: { id: data.user.id, email: normalizedEmail },
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
  };
}

export async function loginWithEmailPassword(email: string, password: string): Promise<AuthResponsePayload> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await authClient.auth.signInWithPassword({
    email: normalizedEmail,
    password
  });

  if (error || !data.user || !data.session) {
    throw new HttpError(401, "Invalid email or password");
  }

  const service = getServiceClient();
  await service
    .from("users")
    .upsert(
      {
        id: data.user.id,
        email: normalizedEmail,
        role: "user",
        is_super_admin: false
      },
      { onConflict: "id" }
    );

  return {
    user: { id: data.user.id, email: normalizedEmail },
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : null
  };
}
