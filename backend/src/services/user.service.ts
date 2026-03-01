import { HttpError } from "../lib/http-error";
import { getServiceClient } from "./supabase.service";
import { getWalletSummary } from "./wallet.service";

const service = getServiceClient();

export async function getUserProfile(userId: string) {
  const { data, error } = await service
    .from("users")
    .select("id,email,role,is_super_admin,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(404, "User profile not found");
  }

  const wallet = await getWalletSummary(userId);

  return {
    id: String(data.id),
    email: String((data as { email?: string | null }).email ?? ""),
    role: String((data as { role?: string }).role ?? "user"),
    isSuperAdmin: Boolean((data as { is_super_admin?: boolean }).is_super_admin),
    createdAt: String((data as { created_at?: string }).created_at ?? ""),
    wallet
  };
}
