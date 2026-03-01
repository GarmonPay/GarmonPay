import { HttpError } from "../lib/http-error";
import { getServiceClient } from "./supabase.service";

const service = getServiceClient();

const allowedEventTypes = new Set([
  "login",
  "ad_view",
  "reward_earned",
  "withdrawal_requested"
]);

export async function trackAnalyticsEvent(input: {
  userId?: string;
  eventType: string;
  source: string;
  payload?: Record<string, unknown>;
}) {
  const eventType = input.eventType.trim().toLowerCase();
  if (!allowedEventTypes.has(eventType)) {
    throw new HttpError(400, "Unsupported analytics event type");
  }

  const { error } = await service.from("analytics_events").insert({
    user_id: input.userId ?? null,
    event_type: eventType,
    source: input.source,
    payload: input.payload ?? {}
  });

  if (error) {
    throw new HttpError(500, "Failed to store analytics event");
  }
}

export async function listAnalyticsEvents(input: {
  limit: number;
  offset: number;
  eventType?: string;
}) {
  let query = service
    .from("analytics_events")
    .select("id,user_id,event_type,source,payload,created_at,users(email)")
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);

  if (input.eventType) {
    query = query.eq("event_type", input.eventType);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(500, "Failed to load analytics events");
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String((row as { user_id?: string | null }).user_id ?? ""),
    userEmail: String(
      (row as { users?: { email?: string | null } | null }).users?.email ?? ""
    ),
    eventType: String((row as { event_type?: string }).event_type ?? ""),
    source: String((row as { source?: string }).source ?? ""),
    payload: (row as { payload?: Record<string, unknown> | null }).payload ?? {},
    createdAt: String((row as { created_at?: string }).created_at ?? "")
  }));
}
