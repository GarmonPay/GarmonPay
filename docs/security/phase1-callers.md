# Phase 1 caller inventory (before changes)
All source files were searched; entries include central auth dependents, administrative routes, header producers, reward/deposit/diagnostic callers, and RPC calls. No production database was queried.

## security-callers

```text
backend/src/controllers/rewardsController.ts:4:/** POST /api/rewards/credit — credit reward to user wallet (e.g. after ad view). */
backend/src/middleware/admin.ts:8:export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
backend/README.md:36:- `POST /api/rewards/credit` — body: `{ amount, eventType }` (amount in cents)
src/lib/admin-auth.ts:19:export async function getAdminAuthUserId(request: Request): Promise<string | null> {
src/lib/admin-auth.ts:63:export async function isAdmin(request: Request): Promise<boolean> {
src/lib/admin-auth.ts:64:  return (await getAdminAuthUserId(request)) !== null;
src/lib/admin-supabase.ts:10:  isSuperAdmin?: boolean;
src/lib/admin-supabase.ts:36:      isSuperAdmin: !!data.isSuperAdmin,
src/lib/auth-store.ts:27:export function isSuperAdmin(user: StoredUser): boolean {
src/lib/auth-store.ts:34:  return user ? isSuperAdmin(user) : false;
src/lib/auth-store.ts:39:  return getUserRole(user) === "admin" || isSuperAdmin(user);
src/core/auth.ts:20:  isSuperAdmin?: boolean;
src/core/auth.ts:49:  let isSuperAdmin = false;
src/core/auth.ts:53:    if (row) isSuperAdmin = !!(row as { is_super_admin?: boolean }).is_super_admin;
src/core/auth.ts:62:  const user: AuthUser = { id: data.user.id, email: data.user.email ?? "", role, isSuperAdmin };
src/core/auth.ts:69:  return { ok: true, user, isAdmin: role === "admin" || isSuperAdmin };
src/core/auth.ts:185:  let isSuperAdmin: boolean | undefined;
src/core/auth.ts:189:    isSuperAdmin = !!(row as { is_super_admin?: boolean }).is_super_admin;
src/core/auth.ts:191:  return { id: user.id, email: user.email ?? "", role, isSuperAdmin };
mobile/lib/core/api_client.dart:52:      Uri.parse('$_base/api/rewards/credit'),
src/core/admin.ts:7: * Protected admin service. Handle ONLY: checkAdmin, checkSuperAdmin, adminControls.
src/core/admin.ts:11:import { findUserById, hasAdminAccess, isSuperAdmin } from "@/lib/auth-store";
src/core/admin.ts:13:import { getOwnerFlags, updateOwnerFlags } from "@/lib/god-mode-db";
src/core/admin.ts:16:export function checkAdmin(userId: string): boolean {
src/core/admin.ts:24:  if (user && isSuperAdmin(user)) return true;
src/lib/auth-request.ts:19:export async function getAuthUserId(request: Request): Promise<string | null> {
src/lib/auth-request.ts:80:export async function getAuthUserIdStrict(request: Request): Promise<string | null> {
src/lib/auth-request.ts:99:export async function getAuthUserIdBearerOrCookie(request: Request): Promise<string | null> {
src/lib/admin.ts:18:export async function isAdmin(userId: string): Promise<boolean> {
src/app/god-mode/page.tsx:54:    if (!session.isSuperAdmin) {
src/app/god-mode/page.tsx:60:    fetch(`${API_BASE}/god-mode`, { headers: { "X-Admin-Id": session.adminId } })
src/app/god-mode/page.tsx:74:    if (!session?.isSuperAdmin || !flags) return;
src/app/god-mode/page.tsx:78:      const res = await fetch(`${API_BASE}/god-mode/controls`, {
src/app/api/banners/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/banners/route.ts:23:  const userId = await getAuthUserId(request);
src/app/api/banners/route.ts:38:  const userId = await getAuthUserId(request);
src/app/api/stripe/add-funds/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/stripe/add-funds/route.ts:13:  const userId = await getAuthUserIdStrict(req);
src/app/api/coins/convert/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coins/convert/route.ts:50:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/create-checkout-session/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/create-checkout-session/route.ts:25:  const userId = await getAuthUserIdStrict(request);
src/app/api/coins/history/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coins/history/route.ts:7:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/stripe/gold-coins/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/stripe/gold-coins/route.ts:19:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/referrals/create/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/referrals/create/route.ts:13:    const userId = await getAuthUserId(request);
src/app/api/referral-commissions/route.ts:3:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/referral-commissions/route.ts:9:  const userId = await getAuthUserId(request);
src/app/api/referral-bonus/ensure/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/referral-bonus/ensure/route.ts:9:  const userId = await getAuthUserId(request);
src/app/api/gamification/summary/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/gamification/summary/route.ts:26:  const userId = await getAuthUserId(request);
src/app/api/gamification/streak/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/gamification/streak/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/gamification/streak/route.ts:18:  const userId = await getAuthUserId(request);
src/app/api/admin/analytics/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/coins/checkout/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coins/checkout/route.ts:26:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/referrals/my-referrals/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/referrals/my-referrals/route.ts:13:    const userId = await getAuthUserId(request);
src/app/api/bets/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/bets/route.ts:8:  const userId = await getAuthUserIdStrict(req);
src/app/api/stripe/create-membership-session/route.ts:3:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/stripe/create-membership-session/route.ts:27:  const userId = await getAuthUserId(req);
src/app/api/earn/watch/start/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/earn/watch/start/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/gamification/mystery-box/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/gamification/mystery-box/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/admin/ad-packages/route.ts:42:  if (!(await isAdmin(request))) {
src/app/api/admin/ad-packages/route.ts:66:  if (!(await isAdmin(request))) {
src/app/api/admin/ad-packages/route.ts:133:  if (!(await isAdmin(request))) {
src/app/api/gamification/missions/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/gamification/missions/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/coins/balance/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/coins/balance/route.ts:11:  const userId = await getAuthUserIdStrict(request);
src/app/api/referrals/attach/route.ts:7:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/referrals/attach/route.ts:11:  const userId = await getAuthUserId(request);
src/app/api/earn/watch/complete/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/earn/watch/complete/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/gamification/spin/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/gamification/spin/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/creator/videos/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/creator/videos/route.ts:10:  const userId = await getAuthUserId(request);
src/app/api/creator/videos/route.ts:32:  const userId = await getAuthUserId(request);
src/app/api/admin/stats/route.ts:43:  if (!(await isAdmin(request))) {
src/app/api/gamification/missions/complete/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/gamification/missions/complete/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/referrals/dashboard/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/referrals/dashboard/route.ts:27:  const userId = await getAuthUserId(request);
src/app/api/earn/feed/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/earn/feed/route.ts:13:  const userId = await getAuthUserId(request);
src/app/api/admin/social/pending/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/webhooks/stripe/subscribe/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/webhooks/stripe/subscribe/route.ts:13:  const userId = await getAuthUserId(request);
src/app/api/arena/store/buy/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/store/buy/route.ts:8:  const userId = await getAuthUserIdStrict(req);
src/app/api/auth/admin/login/route.ts:86:  const isSuperAdmin = !!(profile as { is_super_admin?: boolean } | null)?.is_super_admin;
src/app/api/auth/admin/login/route.ts:88:    isSuperAdmin ||
src/app/api/auth/admin/login/route.ts:110:    isSuperAdmin,
src/app/api/arena/test-meshy/route.ts:3:/** GET /api/arena/test-meshy — Test Meshy API connection (no auth required for diagnostics). */
src/app/api/webhooks/stripe/pay/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/webhooks/stripe/pay/route.ts:18:  const userId = await getAuthUserId(request);
src/app/api/admin/throttle/override/route.ts:20:  if (!(await isAdmin(request))) {
src/app/api/admin/social/approve/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/admin/advertisements/upload/route.ts:19:  if (!(await isAdmin(request))) {
src/app/api/admin/ban/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/arena/store/items/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/arena/store/items/route.ts:27:  const userId = await getAuthUserId(req);
src/app/api/auth/admin/me/route.ts:68:    isSuperAdmin: !!row.is_super_admin,
src/app/api/ads/create/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/create/route.ts:14:  const userId = await getAuthUserId(request);
src/app/api/arena/fighter/3d-status/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/fighter/3d-status/route.ts:57:    const userId = await getAuthUserIdStrict(request);
src/app/api/arena/store/inventory/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/store/inventory/route.ts:7:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/advertisements/route.ts:31:  if (!(await isAdmin(request))) {
src/app/api/admin/advertisements/route.ts:45:  if (!(await isAdmin(request))) {
src/app/api/admin/advertisements/route.ts:86:  if (!(await isAdmin(request))) {
src/app/api/admin/advertisements/route.ts:119:  if (!(await isAdmin(request))) {
src/app/api/admin/membership-bonuses/route.ts:6:  if (!(await isAdmin(request))) {
src/app/api/admin/social/tasks/route.ts:13:  if (!(await isAdmin(req))) {
src/app/api/admin/revenue/route.ts:125:  if (!(await isAdmin(request))) {
src/app/api/tournaments/[id]/joined/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/tournaments/[id]/joined/route.ts:10:  const userId = await getAuthUserId(request);
src/app/api/arena/fighter/ai-generate/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/fighter/ai-generate/route.ts:16:    const userId = await getAuthUserIdStrict(request);
src/app/api/arena/store/checkout/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/store/checkout/route.ts:8:  const userId = await getAuthUserIdStrict(req);
src/app/api/ads/list/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/list/route.ts:9:  const userId = await getAuthUserId(request);
src/app/api/admin/game-config/route.ts:9:  if (!(await isAdmin(request))) {
src/app/api/admin/game-config/route.ts:35:  if (!(await isAdmin(request))) {
src/app/api/arena/fighter/generate-3d/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/fighter/generate-3d/route.ts:9:    const userId = await getAuthUserIdStrict(request);
src/app/api/arena/tournaments/[id]/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/arena/tournaments/[id]/route.ts:10:  const userId = await getAuthUserId(req);
src/app/api/admin/tournaments/route.ts:12:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/tournaments/route.ts:27:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/tournaments/route.ts:51:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/tournaments/join/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/tournaments/join/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/membership/balance-eligibility/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/membership/balance-eligibility/route.ts:9:  const userId = await getAuthUserIdStrict(req);
src/app/api/arena/fighter/equip/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/fighter/equip/route.ts:14:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/referral-commissions/route.ts:14:  if (!(await isAdmin(request))) {
src/app/api/admin/referral-commissions/route.ts:49:  if (!(await isAdmin(request))) {
src/app/api/arena/tournaments/[id]/start/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/tournaments/[id]/start/route.ts:11:  const userId = await getAuthUserIdStrict(req);
src/app/api/ads/earnings/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/earnings/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/admin/creators/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/activities/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/activities/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/admin/ads/upload/route.ts:9:  if (!(await isAdmin(request))) {
src/app/api/membership/upgrade-with-balance/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/membership/upgrade-with-balance/route.ts:18:  const userId = await getAuthUserIdStrict(req);
src/app/api/arena/tournaments/[id]/join/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/tournaments/[id]/join/route.ts:12:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/platform-balance/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/ads/route.ts:11:  if (!(await isAdmin(request))) {
src/app/api/admin/ads/route.ts:29:  if (!(await isAdmin(request))) {
src/app/api/admin/ads/route.ts:78:  if (!(await isAdmin(request))) {
src/app/api/ads/feed/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/feed/route.ts:24:  const userId = await getAuthUserId(request);
src/app/api/pinball/game/end/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/pinball/game/end/route.ts:17:  const userId = await getAuthUserId(req);
src/app/api/arena/tournaments/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/arena/tournaments/route.ts:7:  const userId = await getAuthUserId(req);
src/app/api/admin/gpay/claims/[id]/approve/route.ts:2:import { getAdminAuthUserId } from "@/lib/admin-auth";
src/app/api/admin/gpay/claims/[id]/approve/route.ts:18:  const reviewerId = await getAdminAuthUserId(request);
src/app/api/admin/tournaments/end/route.ts:9:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/notifications/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/notifications/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/notifications/route.ts:31:  const userId = await getAuthUserId(request);
src/app/api/ads/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/route.ts:9:  const userId = await getAuthUserId(request);
src/app/api/admin/coin-flip/stats/route.ts:14:  if (!(await isAdmin(request))) {
src/app/api/pinball/game/start/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/pinball/game/start/route.ts:7:  const userId = await getAuthUserId(req);
src/app/api/admin/wallet-reconcile/route.ts:11:  if (!(await isAdmin(request))) {
src/app/api/admin/users/[userId]/username-history/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/wallet/fund/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/wallet/fund/route.ts:18:  const userId = await getAuthUserIdStrict(request);
src/app/api/arena/season-pass/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/season-pass/route.ts:7:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/garmon-ads/top-earners/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/gpay/claims/[id]/complete/route.ts:2:import { getAdminAuthUserId } from "@/lib/admin-auth";
src/app/api/admin/gpay/claims/[id]/complete/route.ts:18:  const reviewerId = await getAdminAuthUserId(request);
src/app/api/admin/users/credit-gpay/route.ts:14:  if (!(await isAdmin(request))) {
src/app/api/admin/celo/cleanup-orphaned-debits/route.ts:35:  if (!(await isAdmin(request))) {
src/app/api/wallet/convert-to-sc/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/wallet/convert-to-sc/route.ts:12:  const userId = await getAuthUserIdStrict(req);
src/app/api/ads/social/add/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/social/add/route.ts:18:  const userId = await getAuthUserId(request);
src/app/api/admin/users/credit-usd/route.ts:14:  if (!(await isAdmin(request))) {
src/app/api/admin/garmon-ads/fraud-flags/ban/route.ts:7:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/arena/season-pass/checkout/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/season-pass/checkout/route.ts:8:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/celo/audit/route.ts:11:  if (!(await isAdmin(request))) {
src/app/api/admin/stripe-payments/route.ts:9:  if (!(await isAdmin(request))) {
src/app/api/wallet/history/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/wallet/history/route.ts:11:  const userId = await getAuthUserId(req);
src/app/api/admin/users/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/convert-to-ad-credit/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/convert-to-ad-credit/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/games/budget/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/budget/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/admin/gpay/claims/[id]/reject/route.ts:2:import { getAdminAuthUserId } from "@/lib/admin-auth";
src/app/api/admin/gpay/claims/[id]/reject/route.ts:19:  const reviewerId = await getAdminAuthUserId(request);
src/app/api/admin/garmon-ads/fraud-flags/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/garmon-ads/fraud-flags/route.ts:23:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/ads/engage/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/engage/route.ts:9:  const userId = await getAuthUserId(request);
src/app/api/admin/rates/route.ts:50:  if (!(await isAdmin(request))) {
src/app/api/admin/rates/route.ts:97:  if (!(await isAdmin(request))) {
src/app/api/wallet/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/wallet/route.ts:10:  const userId = await getAuthUserId(req);
src/app/api/admin/throttle-log/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/users/credit-sweeps/route.ts:16:  if (!(await isAdmin(request))) {
src/app/api/games/mystery-box/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/mystery-box/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/arena/season-pass/portal/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/season-pass/portal/route.ts:8:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/garmon-ads/route.ts:8:  if (!(await isAdmin(request))) {
src/app/api/admin/garmon-ads/route.ts:37:  if (!(await isAdmin(request))) {
src/app/api/admin/banners/route.ts:13:  if (!(await isAdmin(request))) {
src/app/api/admin/banners/route.ts:41:  if (!(await isAdmin(request))) {
src/app/api/admin/gpay/reward/route.ts:37:  if (await isAdmin(request)) return true;
src/app/api/admin/wallet-stats/route.ts:11:  if (!(await isAdmin(request))) {
src/app/api/admin/users/change-username/route.ts:4:import { getAdminAuthUserId } from "@/lib/admin-auth";
src/app/api/admin/users/change-username/route.ts:14:  const adminId = await getAdminAuthUserId(req);
src/app/api/account/username-history/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/account/username-history/route.ts:7:  const userId = await getAuthUserIdStrict(req);
src/app/api/ads/engage/start/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/engage/start/route.ts:13:  const userId = await getAuthUserId(request);
src/app/api/wallet/balance/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/wallet/balance/route.ts:7:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/platform-metrics/route.ts:53:  if (!(await isAdmin(request))) {
src/app/api/arena/train/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/train/route.ts:18:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/garmon-ads/banned-users/route.ts:7:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/garmon-ads/banned-users/route.ts:21:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/gamification/route.ts:15:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/gamification/route.ts:42:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/sync-users/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/sync-users/route.ts:19:  if (!(await isAdmin(request))) {
src/app/api/games/daily-bonus/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/daily-bonus/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/admin/launch-checklist/route.ts:2:import { getAdminAuthUserId, isAdmin } from "@/lib/admin-auth";
src/app/api/admin/launch-checklist/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/launch-checklist/route.ts:38:  if (!(await isAdmin(request))) {
src/app/api/admin/launch-checklist/route.ts:41:  const adminId = await getAdminAuthUserId(request);
src/app/api/god-mode/route.ts:2:import { findUserById, isSuperAdmin } from "@/lib/auth-store";
src/app/api/god-mode/route.ts:4:import { getGodModeStats, getOwnerFlags, getPlatformProfitCents } from "@/lib/god-mode-db";
src/app/api/god-mode/route.ts:6:async function isSuperAdminRequest(request: Request): Promise<boolean> {
src/app/api/god-mode/route.ts:10:  if (user && isSuperAdmin(user)) return true;
src/app/api/god-mode/route.ts:19:/** GET /api/god-mode — platform stats + activity. Only super admin. */
src/app/api/god-mode/route.ts:21:  if (!(await isSuperAdminRequest(request))) {
src/app/api/admin/platform-settings/route.ts:8:  if (!(await isAdmin(request))) {
src/app/api/admin/platform-settings/route.ts:38:  if (!(await isAdmin(request))) {
src/app/api/admin/security/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/gamification-config/route.ts:27:  if (!(await isAdmin(request))) {
src/app/api/admin/gamification-config/route.ts:88:  if (!(await isAdmin(request))) {
src/app/api/ads/leaderboard/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/leaderboard/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/wallet/get/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/wallet/get/route.ts:11:  const userId = await getAuthUserId(req);
src/app/api/games/pinball/stats/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/pinball/stats/route.ts:7:  const userId = await getAuthUserId(req);
src/app/api/admin/route.ts:6:  if (!(await isAdmin(request))) {
src/app/api/admin/garmon-ads/advertisers/route.ts:7:  if (!(await isAdmin(request))) {
src/app/api/admin/garmon-ads/advertisers/route.ts:23:  if (!(await isAdmin(request))) {
src/app/api/arena/fights/create/route.ts:3:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/fights/create/route.ts:88:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/transactions/route.ts:8:  if (!(await isAdmin(request))) {
src/app/api/admin/videos/[id]/route.ts:16:  if (!(await isAdmin(request))) {
src/app/api/admin/referrals-stats/route.ts:15:  if (!(await isAdmin(request))) {
src/app/api/games/pinball/score/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/pinball/score/route.ts:7:  const userId = await getAuthUserId(req);
src/app/api/admin/unlock/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/ads/my-ads/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/my-ads/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/god-mode/controls/route.ts:2:import { findUserById, isSuperAdmin } from "@/lib/auth-store";
src/app/api/god-mode/controls/route.ts:4:import { updateOwnerFlags } from "@/lib/god-mode-db";
src/app/api/god-mode/controls/route.ts:6:async function isSuperAdminRequest(request: Request): Promise<boolean> {
src/app/api/god-mode/controls/route.ts:10:  if (user && isSuperAdmin(user)) return true;
src/app/api/god-mode/controls/route.ts:19:/** PATCH /api/god-mode/controls — set pause_ads, pause_withdrawals, maintenance_mode. Only super admin. */
src/app/api/god-mode/controls/route.ts:21:  if (!(await isSuperAdminRequest(request))) {
src/app/api/admin/videos/route.ts:2:import { isAdmin, getAdminAuthUserId } from "@/lib/admin-auth";
src/app/api/admin/videos/route.ts:15:  if (!(await isAdmin(request))) {
src/app/api/admin/videos/route.ts:62:  if (!(await isAdmin(request))) {
src/app/api/admin/videos/route.ts:65:  const adminId = await getAdminAuthUserId(request);
src/app/api/admin/videos/route.ts:113:  if (!(await isAdmin(request))) {
src/app/api/admin/videos/route.ts:116:  const adminId = await getAdminAuthUserId(request);
src/app/api/wallet/deposit/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/wallet/deposit/route.ts:19:  const userId = await getAuthUserIdStrict(req);
src/app/api/arena/fights/[fightId]/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/arena/fights/[fightId]/route.ts:11:  const userId = await getAuthUserId(req);
src/app/api/arena/fights/[fightId]/route.ts:81:  const userId = await getAuthUserId(req);
src/app/api/admin/garmon-ads/user-engagements/route.ts:7:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/recover-payments/route.ts:9:  if (!(await isAdmin(req))) {
src/app/api/admin/recover-stripe-payments/route.ts:105:  if (!(await isAdmin(request))) {
src/app/api/games/pinball/start/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/pinball/start/route.ts:10:  const userId = await getAuthUserId(req);
src/app/api/stripe-connect/onboard/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/stripe-connect/onboard/route.ts:15:  const userId = await getAuthUserId(request);
src/app/api/arena/fights/[fightId]/spectator-bet/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/fights/[fightId]/spectator-bet/route.ts:12:  const userId = await getAuthUserIdStrict(req);
src/app/api/admin/balance-monitor/route.ts:17:  if (!(await isAdmin(request))) {
src/app/api/admin/finance/route.ts:62:  if (!(await isAdmin(request))) {
src/app/api/ads/streak/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/streak/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/admin/arena/overview/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/admin/balance-monitor/fix/route.ts:13:  if (!(await isAdmin(request))) {
src/app/api/daily-reward/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/daily-reward/route.ts:8:  const userId = await getAuthUserId(request);
src/app/api/stripe-connect/transfer/route.ts:16:  if (!(await isAdmin(request))) {
src/app/api/arena/fights/live/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/arena/fights/live/route.ts:7:  const userId = await getAuthUserId(req);
src/app/api/admin/garmon-ads/blocked-ips/route.ts:7:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/garmon-ads/blocked-ips/route.ts:21:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/admin/garmon-ads/blocked-ips/route.ts:43:  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
src/app/api/gpay/claims/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/gpay/claims/route.ts:55:  const userId = await getAuthUserIdStrict(request);
src/app/api/gpay/claims/route.ts:84:  const userId = await getAuthUserIdStrict(request);
src/app/api/games/scratch/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/scratch/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/admin/arena/security/route.ts:7:  if (!(await isAdmin(req))) {
src/app/api/arena/jackpot/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/arena/jackpot/route.ts:9:  await getAuthUserId(req);
src/app/api/garmondrop/forfeit/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/garmondrop/forfeit/route.ts:14:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/ads/advertiser/create/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/advertiser/create/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/gpay/balance/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/gpay/balance/route.ts:14:  const userId = await getAuthUserIdStrict(request);
src/app/api/games/spin/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/spin/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/gpay/ledger/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/gpay/ledger/route.ts:25:  const userId = await getAuthUserIdStrict(request);
src/app/api/teams/leave/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/teams/leave/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/games/station/stats/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/station/stats/route.ts:8:  const userId = await getAuthUserId(req);
src/app/api/gpay/earn/route.ts:22:  if (!(await isAdmin(request))) {
src/app/api/arena/me/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/me/route.ts:15:  const userId = await getAuthUserIdStrict(req);
src/app/api/teams/join/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/teams/join/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/growth/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/growth/route.ts:15:  const userId = await getAuthUserId(request);
src/app/api/garmondrop/open/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/garmondrop/open/route.ts:7:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/ads/advertiser/me/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/ads/advertiser/me/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/deposits/list/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/deposits/list/route.ts:9:  const isAdminUser = !!(adminId && (await isAdmin(request)));
src/app/api/deposits/list/route.ts:10:  const userId = await getAuthUserId(request);
src/app/api/garmondrop/cancel/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/garmondrop/cancel/route.ts:12:  const userId = await getAuthUserIdStrict(request);
src/app/api/transactions/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/transactions/route.ts:16:  const userId = await getAuthUserId(request);
src/app/api/teams/[id]/members/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/teams/[id]/members/route.ts:10:  const userId = await getAuthUserId(request);
src/app/api/garmondrop/move/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/garmondrop/move/route.ts:15:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/profile/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/profile/route.ts:40:  const userId = await getAuthUserIdStrict(req);
src/app/api/profile/route.ts:163:  const userId = await getAuthUserIdStrict(req);
src/app/api/garmondrop/repair-turn/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/garmondrop/repair-turn/route.ts:11:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/profile/tax-info/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/profile/tax-info/route.ts:10:  const userId = await getAuthUserIdStrict(req);
src/app/api/games/station/score/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/station/score/route.ts:9:  const userId = await getAuthUserId(req);
src/app/api/garmondrop/post-entry/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/garmondrop/post-entry/route.ts:14:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/teams/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/teams/route.ts:7:  const userId = await getAuthUserId(request);
src/app/api/teams/route.ts:20:  const userId = await getAuthUserId(request);
src/app/api/ads/deposit/checkout/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/ads/deposit/checkout/route.ts:20:  const userId = await getAuthUserIdStrict(request);
src/app/api/arena/achievements/check/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/achievements/check/route.ts:12:  const userId = await getAuthUserIdStrict(req);
src/app/super-admin/page.tsx:13:      if (!session?.isSuperAdmin) {
src/app/api/games/station/start/route.ts:2:import { getAuthUserId } from "@/lib/auth-request";
src/app/api/games/station/start/route.ts:20:  const userId = await getAuthUserId(req);
src/app/api/arena/achievements/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/achievements/route.ts:14:  const userId = await getAuthUserIdStrict(req);
src/app/api/coin-flip/open/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coin-flip/open/route.ts:7:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/arena/daily-login/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/daily-login/route.ts:10:  const userId = await getAuthUserIdStrict(req);
src/app/api/arena/daily-login/route.ts:50:  const userId = await getAuthUserIdStrict(req);
src/app/api/arena/spin/route.ts:2:import { getAuthUserIdStrict } from "@/lib/auth-request";
src/app/api/arena/spin/route.ts:13:  const userId = await getAuthUserIdStrict(req);
src/app/api/arena/spin/route.ts:43:  const userId = await getAuthUserIdStrict(req);
src/app/api/coin-flip/create/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coin-flip/create/route.ts:13:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/coin-flip/history/route.ts:2:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coin-flip/history/route.ts:7:  const userId = await getAuthUserIdBearerOrCookie(request);
src/app/api/coin-flip/join/route.ts:3:import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
src/app/api/coin-flip/join/route.ts:91:  const userId = await getAuthUserIdBearerOrCookie(request);
```

## rpc-callers

```text
src/lib/transactions-db.ts:32:  const { data, error } = await supabase().rpc("convert_balance_to_ad_credit", {
src/lib/celo-accounting.ts:115:  const { data, error } = await admin.rpc("celo_finalize_banker_terminal_round", {
src/lib/celo-accounting.ts:147:  const { data, error } = await admin.rpc("celo_reconcile_terminal_room_bank", {
src/lib/celo-accounting.ts:168:  const { error: rpcErr } = await admin.rpc("celo_increment_round_banker_accounting", {
src/lib/ads-db.ts:176:  const { data, error } = await supabase().rpc("complete_ad_session_with_platform_protection", {
src/lib/ads-db.ts:198:  const { data, error } = await supabase().rpc("complete_ad_session_and_issue_reward", {
src/lib/viral-db.ts:87:  const { data, error } = await supabase().rpc("claim_daily_reward", {
src/lib/reportable-earnings.ts:26:  const { data, error } = await admin.rpc("increment_profile_reportable_earnings", {
src/lib/coin-flip-ledger.ts:18:  const { data, error } = await supabase.rpc("coin_flip_record_platform_fee", {
src/lib/social-fraud-detection.ts:350:      const { error: rpcErr } = await supabase.rpc("increment_social_strikes", {
src/lib/platform-balance.ts:59:  const { error } = await supabase().rpc("platform_record_revenue", {
src/lib/platform-balance.ts:74:  const { error } = await supabase().rpc("platform_record_payout", {
src/hooks/useUsernameAvailability.ts:49:      const { data, error: rpcError } = await supabase.rpc("check_username_available", args);
src/lib/coins.ts:26:  let { error } = await supabase.rpc("credit_coins", {
src/lib/coins.ts:32:    ({ error } = await supabase.rpc("credit_coins", {
src/lib/coins.ts:123:  const { data, error } = await supabase.rpc("credit_coins_with_ledger", {
src/lib/coins.ts:258:  const { data, error } = await supabase.rpc("process_game_loss", {
src/lib/celo-bank-bust.ts:41:  const { data: rpcData, error: rpcError } = await admin.rpc(
src/lib/referral-commissions-db.ts:53:  const { data, error } = await supabase().rpc("process_all_due_referral_commissions");
src/lib/referral-commissions-db.ts:73:  const { data, error } = await supabase().rpc("process_subscription_billing", {
src/lib/gpay-ledger.ts:59:  const { data, error } = await supabase().rpc("gpay_ledger_entry", {
src/lib/celo-platform-fee.ts:15:  const { data, error } = await supabase.rpc("celo_record_platform_fee", {
src/lib/wallet-ledger.ts:96:  const { data, error } = await supabase().rpc("wallet_ledger_entry", {
src/lib/membership-purchase-balance.ts:53:  const { data, error } = await admin.rpc("purchase_membership_with_balance_v2", {
src/app/dashboard/settings/page.tsx:188:    const { data, error } = await supabase.rpc("change_username", { p_new_username: trimmed });
src/app/api/auth/sync-user/route.ts:166:      const { data: usernameAvailable, error: usernameCheckError } = await supabase.rpc(
src/app/api/cron/margin-throttle/route.ts:76:  const { data: marginData, error: marginErr } = await supabase.rpc("garmon_margin_last_24h");
src/app/api/celo/post-entry/route.ts:180:  const { data: rpcResult, error: rpcError } = await adminClient.rpc(
src/app/api/garmondrop/forfeit/route.ts:41:  const { data, error } = await admin.rpc("garmondrop_forfeit_atomic", {
src/app/api/coins/convert/route.ts:76:  const { data: convRaw, error: rpcErr } = await supabase.rpc(
src/app/api/garmondrop/repair-turn/route.ts:33:  const { data, error } = await admin.rpc("garmondrop_repair_turn_atomic", {
src/app/api/garmondrop/post-entry/route.ts:64:  const { data, error } = await admin.rpc("garmondrop_post_entry_atomic", {
src/app/api/garmondrop/move/route.ts:60:  const { data, error } = await admin.rpc("garmondrop_make_move_atomic", {
src/app/api/garmondrop/cancel/route.ts:36:  const { data, error } = await client.rpc("garmondrop_cancel_room", {
src/app/api/admin/users/change-username/route.ts:66:  const { data, error } = await userClient.rpc("admin_change_username", {
src/app/api/arena/fights/[fightId]/route.ts:131:        const { error: rpcErr } = await supabase.rpc("increment_arena_coins", {
src/app/api/admin/balance-monitor/route.ts:36:    const { data: driftData, error: driftError } = await supabase.rpc("admin_balance_monitor_drift");
```

## rpc-inventory

```text
supabase/migrations/20260402120001_sync_users_balance_cents.sql:11:CREATE OR REPLACE FUNCTION public.sync_users_balance_from_wallet()
supabase/migrations/20260402120001_sync_users_balance_cents.sql:14:SECURITY DEFINER
supabase/migrations/20260425120000_referral_commissions_pay_gpc.sql:4:CREATE OR REPLACE FUNCTION public.process_subscription_billing(p_subscription_id uuid)
supabase/migrations/20260425120000_referral_commissions_pay_gpc.sql:7:SECURITY DEFINER
supabase/migrations/20260416120000_gpay_balance_foundation.sql:111:CREATE OR REPLACE FUNCTION public.gpay_ledger_entry(
supabase/migrations/20260416120000_gpay_balance_foundation.sql:120:SECURITY DEFINER
supabase/migrations/20260416120000_gpay_balance_foundation.sql:269:GRANT EXECUTE ON FUNCTION public.gpay_ledger_entry(uuid, text, bigint, text, jsonb) TO service_role;
supabase/migrations/20261001170000_celo_bank_takeover_idempotent_reaffirm.sql:4:CREATE OR REPLACE FUNCTION public.celo_next_free_player_seat(p_room_id uuid, p_cap integer)
supabase/migrations/20261001170000_celo_bank_takeover_idempotent_reaffirm.sql:32:CREATE OR REPLACE FUNCTION public.celo_handle_bank_bust_and_transfer(
supabase/migrations/20261001170000_celo_bank_takeover_idempotent_reaffirm.sql:40:SECURITY DEFINER
supabase/migrations/20261001170000_celo_bank_takeover_idempotent_reaffirm.sql:240:GRANT EXECUTE ON FUNCTION public.celo_handle_bank_bust_and_transfer(uuid, uuid, integer, text) TO service_role;
supabase/migrations/20260612120000_username_change_history.sql:38:-- No direct access to reservations for clients (RPCs use SECURITY DEFINER).
supabase/migrations/20260612120000_username_change_history.sql:40:CREATE OR REPLACE FUNCTION public.cleanup_expired_username_reservations()
supabase/migrations/20260612120000_username_change_history.sql:43:SECURITY DEFINER
supabase/migrations/20260612120000_username_change_history.sql:56:CREATE OR REPLACE FUNCTION public.check_username_available(
supabase/migrations/20260612120000_username_change_history.sql:62:SECURITY DEFINER
supabase/migrations/20260612120000_username_change_history.sql:111:GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO anon;
supabase/migrations/20260612120000_username_change_history.sql:112:GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO authenticated;
supabase/migrations/20260612120000_username_change_history.sql:113:GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO service_role;
supabase/migrations/20260612120000_username_change_history.sql:115:CREATE OR REPLACE FUNCTION public.change_username(p_new_username text)
supabase/migrations/20260612120000_username_change_history.sql:118:SECURITY DEFINER
supabase/migrations/20260612120000_username_change_history.sql:193:GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;
supabase/migrations/20260612120000_username_change_history.sql:194:GRANT EXECUTE ON FUNCTION public.change_username(text) TO service_role;
supabase/migrations/20260612120000_username_change_history.sql:196:CREATE OR REPLACE FUNCTION public.admin_change_username(
supabase/migrations/20260612120000_username_change_history.sql:203:SECURITY DEFINER
supabase/migrations/20260612120000_username_change_history.sql:274:GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text, text) TO authenticated;
supabase/migrations/20260612120000_username_change_history.sql:275:GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text, text) TO service_role;
supabase/migrations/20260429120000_process_game_loss_gpc.sql:5:CREATE OR REPLACE FUNCTION public.process_game_loss(
supabase/migrations/20260429120000_process_game_loss_gpc.sql:14:SECURITY DEFINER
supabase/migrations/20260429120000_process_game_loss_gpc.sql:68:GRANT EXECUTE ON FUNCTION public.process_game_loss(uuid, integer, text, text, text) TO service_role;
supabase/migrations/20260429120000_process_game_loss_gpc.sql:71:CREATE OR REPLACE FUNCTION public.debit_gpay_coins_with_ledger(
supabase/migrations/20260429120000_process_game_loss_gpc.sql:80:SECURITY DEFINER
supabase/migrations/20260429120000_process_game_loss_gpc.sql:98:-- forged credits. USD wallet changes must go through public.wallet_ledger_entry (SECURITY DEFINER).
supabase/migrations/20260430130000_credit_coins_with_ledger.sql:3:CREATE OR REPLACE FUNCTION public.credit_coins_with_ledger(
supabase/migrations/20260430130000_credit_coins_with_ledger.sql:13:SECURITY DEFINER
supabase/migrations/20260430130000_credit_coins_with_ledger.sql:55:GRANT EXECUTE ON FUNCTION public.credit_coins_with_ledger(uuid, integer, integer, text, text, text) TO service_role;
supabase/migrations/20260611113000_username_constraints.sql:126:CREATE OR REPLACE FUNCTION public.check_username_available(candidate text)
supabase/migrations/20260611113000_username_constraints.sql:129:SECURITY DEFINER
supabase/migrations/20260611113000_username_constraints.sql:164:GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon;
supabase/migrations/20260611113000_username_constraints.sql:165:GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO authenticated;
supabase/migrations/20260611113000_username_constraints.sql:166:GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO service_role;
supabase/migrations/20260504120000_celo_platform_fee_wallet_rpc_and_settlement_version.sql:35:CREATE OR REPLACE FUNCTION public.celo_record_platform_fee(
supabase/migrations/20260504120000_celo_platform_fee_wallet_rpc_and_settlement_version.sql:45:SECURITY DEFINER
supabase/migrations/20260504120000_celo_platform_fee_wallet_rpc_and_settlement_version.sql:98:GRANT EXECUTE ON FUNCTION public.celo_record_platform_fee(uuid, text, integer, text, uuid, text) TO service_role;
supabase/migrations/20260505150000_rewire_signup_trigger.sql:11:CREATE OR REPLACE FUNCTION handle_new_user()
supabase/migrations/20260505150000_rewire_signup_trigger.sql:14:SECURITY DEFINER
supabase/migrations/20260531133000_coin_flip_pvp_only_guard.sql:4:CREATE OR REPLACE FUNCTION public.coin_flip_pvp_only_guard()
supabase/migrations/20260505160000_drop_withdrawal_system.sql:4:CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
supabase/migrations/20260505160000_drop_withdrawal_system.sql:5:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20260419120000_fix_debit_sweeps_coins_read_users.sql:17:CREATE FUNCTION public.debit_sweeps_coins(
supabase/migrations/20260419120000_fix_debit_sweeps_coins_read_users.sql:34:$$ LANGUAGE plpgsql SECURITY DEFINER;
supabase/migrations/20260419120000_fix_debit_sweeps_coins_read_users.sql:36:GRANT EXECUTE ON FUNCTION public.debit_sweeps_coins(uuid, integer) TO service_role;
supabase/migrations/20260505170000_rewire_membership_pay_with_balance.sql:17:CREATE OR REPLACE FUNCTION public.purchase_membership_with_balance_v2(
supabase/migrations/20260505170000_rewire_membership_pay_with_balance.sql:24:SECURITY DEFINER
supabase/migrations/20260420120000_debit_sweeps_coins_single_overload.sql:19:CREATE FUNCTION public.debit_sweeps_coins(
supabase/migrations/20260420120000_debit_sweeps_coins_single_overload.sql:24:SECURITY DEFINER
supabase/migrations/20260420120000_debit_sweeps_coins_single_overload.sql:42:GRANT EXECUTE ON FUNCTION public.debit_sweeps_coins(uuid, integer) TO service_role;
supabase/migrations/20260604100000_celo_banker_terminal_finalize_atomic.sql:16:CREATE OR REPLACE FUNCTION public.celo_finalize_banker_terminal_round(
supabase/migrations/20260604100000_celo_banker_terminal_finalize_atomic.sql:28:SECURITY DEFINER
supabase/migrations/20260604100000_celo_banker_terminal_finalize_atomic.sql:98:GRANT EXECUTE ON FUNCTION public.celo_finalize_banker_terminal_round(
supabase/migrations/20260604100000_celo_banker_terminal_finalize_atomic.sql:103:CREATE OR REPLACE FUNCTION public.celo_reconcile_terminal_room_bank(p_round_id uuid)
supabase/migrations/20260604100000_celo_banker_terminal_finalize_atomic.sql:106:SECURITY DEFINER
supabase/migrations/20260604100000_celo_banker_terminal_finalize_atomic.sql:190:GRANT EXECUTE ON FUNCTION public.celo_reconcile_terminal_room_bank(uuid) TO service_role;
supabase/migrations/20260531190000_coin_flip_pvp_settlement_fee.sql:14:CREATE OR REPLACE FUNCTION public.coin_flip_record_platform_fee(
supabase/migrations/20260531190000_coin_flip_pvp_settlement_fee.sql:22:SECURITY DEFINER
supabase/migrations/20260531190000_coin_flip_pvp_settlement_fee.sql:72:GRANT EXECUTE ON FUNCTION public.coin_flip_record_platform_fee(uuid, integer, uuid, text) TO service_role;
supabase/migrations/20260606100000_gc_to_gpc_flat_rate_97.sql:4:CREATE OR REPLACE FUNCTION public.convert_gold_to_gpay_coins(
supabase/migrations/20260606100000_gc_to_gpc_flat_rate_97.sql:9:SECURITY DEFINER
supabase/migrations/20260428120000_debit_gpay_coins_with_ledger.sql:4:CREATE OR REPLACE FUNCTION public.debit_gpay_coins_with_ledger(
supabase/migrations/20260428120000_debit_gpay_coins_with_ledger.sql:13:SECURITY DEFINER
supabase/migrations/20260428120000_debit_gpay_coins_with_ledger.sql:62:GRANT EXECUTE ON FUNCTION public.debit_gpay_coins_with_ledger(uuid, integer, text, text, text) TO service_role;
supabase/migrations/20260409120001_gold_sweeps_coins.sql:63:CREATE OR REPLACE FUNCTION public.credit_coins(
supabase/migrations/20260409120001_gold_sweeps_coins.sql:69:SECURITY DEFINER
supabase/migrations/20260409120001_gold_sweeps_coins.sql:82:CREATE OR REPLACE FUNCTION public.debit_sweeps_coins(
supabase/migrations/20260409120001_gold_sweeps_coins.sql:87:SECURITY DEFINER
supabase/migrations/20260409120001_gold_sweeps_coins.sql:109:GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer, integer) TO service_role;
supabase/migrations/20260409120001_gold_sweeps_coins.sql:110:GRANT EXECUTE ON FUNCTION public.debit_sweeps_coins(uuid, integer) TO service_role;
supabase/migrations/20260609120000_garmonfour_pvp.sql:3:CREATE OR REPLACE FUNCTION public.garmonfour_empty_board() RETURNS jsonb
supabase/migrations/20260609120000_garmonfour_pvp.sql:15:CREATE OR REPLACE FUNCTION public.garmonfour_cell(g jsonb, r int, c int) RETURNS int
supabase/migrations/20260609120000_garmonfour_pvp.sql:31:CREATE OR REPLACE FUNCTION public.garmonfour_count_dir(
supabase/migrations/20260609120000_garmonfour_pvp.sql:54:CREATE OR REPLACE FUNCTION public.garmonfour_has_winner(
supabase/migrations/20260609120000_garmonfour_pvp.sql:70:CREATE OR REPLACE FUNCTION public.garmonfour_board_full(g jsonb) RETURNS boolean
supabase/migrations/20260609120000_garmonfour_pvp.sql:150:CREATE OR REPLACE FUNCTION public.garmonfour_record_platform_fee(
supabase/migrations/20260609120000_garmonfour_pvp.sql:158:SECURITY DEFINER
supabase/migrations/20260609120000_garmonfour_pvp.sql:206:GRANT EXECUTE ON FUNCTION public.garmonfour_record_platform_fee(uuid, integer, uuid, text) TO service_role;
supabase/migrations/20260609120000_garmonfour_pvp.sql:211:CREATE OR REPLACE FUNCTION public.garmonfour_post_entry_atomic(
supabase/migrations/20260609120000_garmonfour_pvp.sql:220:SECURITY DEFINER
supabase/migrations/20260609120000_garmonfour_pvp.sql:329:GRANT EXECUTE ON FUNCTION public.garmonfour_post_entry_atomic(text, uuid, uuid, integer, text) TO service_role;
supabase/migrations/20260609120000_garmonfour_pvp.sql:334:CREATE OR REPLACE FUNCTION public.garmonfour_make_move_atomic(
supabase/migrations/20260609120000_garmonfour_pvp.sql:343:SECURITY DEFINER
supabase/migrations/20260609120000_garmonfour_pvp.sql:538:GRANT EXECUTE ON FUNCTION public.garmonfour_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
supabase/migrations/20260609120000_garmonfour_pvp.sql:543:CREATE OR REPLACE FUNCTION public.garmonfour_forfeit_atomic(
supabase/migrations/20260609120000_garmonfour_pvp.sql:550:SECURITY DEFINER
supabase/migrations/20260609120000_garmonfour_pvp.sql:634:GRANT EXECUTE ON FUNCTION public.garmonfour_forfeit_atomic(uuid, uuid, text) TO service_role;
supabase/migrations/20260609120000_garmonfour_pvp.sql:639:CREATE OR REPLACE FUNCTION public.garmonfour_cancel_waiting_atomic(
supabase/migrations/20260609120000_garmonfour_pvp.sql:646:SECURITY DEFINER
supabase/migrations/20260609120000_garmonfour_pvp.sql:695:GRANT EXECUTE ON FUNCTION public.garmonfour_cancel_waiting_atomic(uuid, uuid, text) TO service_role;
supabase/migrations/20250328000000_garmonpay_ad_system.sql:15:CREATE OR REPLACE FUNCTION public.garmon_date_utc(ts timestamptz) RETURNS date
supabase/migrations/20260428120000_request_withdrawal_gpay_methods.sql:35:CREATE OR REPLACE FUNCTION public.request_withdrawal(
supabase/migrations/20260428120000_request_withdrawal_gpay_methods.sql:44:SECURITY DEFINER
supabase/migrations/20260426120000_ensure_credit_coins_rpc_gpay_param.sql:5:CREATE OR REPLACE FUNCTION public.credit_coins(
supabase/migrations/20260426120000_ensure_credit_coins_rpc_gpay_param.sql:11:SECURITY DEFINER
supabase/migrations/20260426120000_ensure_credit_coins_rpc_gpay_param.sql:24:GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer, integer) TO service_role;
supabase/migrations/20260327030000_money_system_referral_withdrawal.sql:24:CREATE OR REPLACE FUNCTION generate_referral_code()
supabase/migrations/20260605100000_celo_handle_bank_bust_and_transfer.sql:4:CREATE OR REPLACE FUNCTION public.celo_next_free_player_seat(p_room_id uuid, p_cap integer)
supabase/migrations/20260605100000_celo_handle_bank_bust_and_transfer.sql:32:CREATE OR REPLACE FUNCTION public.celo_handle_bank_bust_and_transfer(
supabase/migrations/20260605100000_celo_handle_bank_bust_and_transfer.sql:40:SECURITY DEFINER
supabase/migrations/20260605100000_celo_handle_bank_bust_and_transfer.sql:220:GRANT EXECUTE ON FUNCTION public.celo_handle_bank_bust_and_transfer(uuid, uuid, integer, text) TO service_role;
supabase/migrations/20260408150000_admin_balance_monitor_drift.sql:4:CREATE OR REPLACE FUNCTION public.admin_balance_monitor_drift()
supabase/migrations/20260408150000_admin_balance_monitor_drift.sql:13:SECURITY DEFINER
supabase/migrations/20260408150000_admin_balance_monitor_drift.sql:34:GRANT EXECUTE ON FUNCTION public.admin_balance_monitor_drift() TO service_role;
supabase/migrations/20250305000000_platform_profit_protection.sql:89:CREATE OR REPLACE FUNCTION public.check_platform_balance_integrity()
supabase/migrations/20250305000000_platform_profit_protection.sql:108:CREATE OR REPLACE FUNCTION public.platform_record_revenue(p_amount_cents bigint, p_source text)
supabase/migrations/20250305000000_platform_profit_protection.sql:109:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20250305000000_platform_profit_protection.sql:120:CREATE OR REPLACE FUNCTION public.platform_record_payout(p_amount_cents bigint, p_source text)
supabase/migrations/20250305000000_platform_profit_protection.sql:121:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20250305000000_platform_profit_protection.sql:149:CREATE OR REPLACE FUNCTION public.complete_ad_session_with_platform_protection(p_user_id uuid, p_session_id uuid)
supabase/migrations/20250305000000_platform_profit_protection.sql:150:RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20260607130000_purchase_membership_with_balance_v2_grants.sql:6:CREATE OR REPLACE FUNCTION public.purchase_membership_with_balance_v2(
supabase/migrations/20260607130000_purchase_membership_with_balance_v2_grants.sql:14:SECURITY DEFINER
supabase/migrations/20260607130000_purchase_membership_with_balance_v2_grants.sql:73:GRANT EXECUTE ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) TO anon;
supabase/migrations/20260607130000_purchase_membership_with_balance_v2_grants.sql:74:GRANT EXECUTE ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) TO authenticated;
supabase/migrations/20260607130000_purchase_membership_with_balance_v2_grants.sql:75:GRANT EXECUTE ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) TO service_role;
supabase/migrations/20260425120000_celo_rls_fix_celo_room_players_recursion.sql:4:-- Membership checks use SECURITY DEFINER so they do not re-enter RLS.
supabase/migrations/20260425120000_celo_rls_fix_celo_room_players_recursion.sql:6:CREATE OR REPLACE FUNCTION public.celo_user_in_room(_room_id uuid)
supabase/migrations/20260425120000_celo_rls_fix_celo_room_players_recursion.sql:10:SECURITY DEFINER
supabase/migrations/20260425120000_celo_rls_fix_celo_room_players_recursion.sql:20:GRANT EXECUTE ON FUNCTION public.celo_user_in_room(uuid) TO authenticated;
supabase/migrations/20260425120000_celo_rls_fix_celo_room_players_recursion.sql:21:GRANT EXECUTE ON FUNCTION public.celo_user_in_room(uuid) TO service_role;
supabase/migrations/20260425120000_celo_rls_fix_celo_room_players_recursion.sql:24:  'True if the current user has a row in celo_room_players for the room (uses SECURITY DEFINER to avoid RLS recursion).';
supabase/migrations/20250328000002_garmon_ad_engage_rpc.sql:4:CREATE OR REPLACE FUNCTION public.garmon_ad_engage(
supabase/migrations/20250328000002_garmon_ad_engage_rpc.sql:17:SECURITY DEFINER
supabase/migrations/20260411210000_reportable_earnings_rpc_tax_info.sql:6:CREATE OR REPLACE FUNCTION public.increment_profile_reportable_earnings(p_user_id uuid, p_delta_cents bigint)
supabase/migrations/20260411210000_reportable_earnings_rpc_tax_info.sql:9:SECURITY DEFINER
supabase/migrations/20260411210000_reportable_earnings_rpc_tax_info.sql:34:GRANT EXECUTE ON FUNCTION public.increment_profile_reportable_earnings(uuid, bigint) TO service_role;
supabase/migrations/20260408120000_social_fraud_schema.sql:31:CREATE OR REPLACE FUNCTION public.increment_social_strikes(p_user_id uuid)
supabase/migrations/20260408120000_social_fraud_schema.sql:34:SECURITY DEFINER
supabase/migrations/20250249000000_critical_repair_stripe_payments.sql:115:CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
supabase/migrations/20250249000000_critical_repair_stripe_payments.sql:116:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20250248000000_payment_tables_and_columns.sql:241:CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
supabase/migrations/20250248000000_payment_tables_and_columns.sql:242:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20260611100000_garmonfour_rls_and_cancel.sql:3:CREATE OR REPLACE FUNCTION public.garmonfour_cancel_room(p_room_id uuid)
supabase/migrations/20260611100000_garmonfour_rls_and_cancel.sql:6:SECURITY DEFINER
supabase/migrations/20260611100000_garmonfour_rls_and_cancel.sql:67:GRANT EXECUTE ON FUNCTION public.garmonfour_cancel_room(uuid) TO authenticated;
supabase/migrations/20260611100000_garmonfour_rls_and_cancel.sql:68:GRANT EXECUTE ON FUNCTION public.garmonfour_cancel_room(uuid) TO service_role;
supabase/migrations/20260423140000_three_tier_coin_system.sql:59:CREATE OR REPLACE FUNCTION public.credit_coins(
supabase/migrations/20260423140000_three_tier_coin_system.sql:65:SECURITY DEFINER
supabase/migrations/20260423140000_three_tier_coin_system.sql:80:CREATE OR REPLACE FUNCTION public.debit_gpay_coins(
supabase/migrations/20260423140000_three_tier_coin_system.sql:85:SECURITY DEFINER
supabase/migrations/20260423140000_three_tier_coin_system.sql:107:GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer, integer) TO service_role;
supabase/migrations/20260423140000_three_tier_coin_system.sql:108:GRANT EXECUTE ON FUNCTION public.debit_gpay_coins(uuid, integer) TO service_role;
supabase/migrations/20260423140000_three_tier_coin_system.sql:110:CREATE OR REPLACE FUNCTION public.credit_gpay_tokens(
supabase/migrations/20260423140000_three_tier_coin_system.sql:115:SECURITY DEFINER
supabase/migrations/20260423140000_three_tier_coin_system.sql:128:GRANT EXECUTE ON FUNCTION public.credit_gpay_tokens(uuid, integer) TO service_role;
supabase/migrations/20260423140000_three_tier_coin_system.sql:130:CREATE OR REPLACE FUNCTION public.debit_gold_coins(
supabase/migrations/20260423140000_three_tier_coin_system.sql:135:SECURITY DEFINER
supabase/migrations/20260423140000_three_tier_coin_system.sql:155:GRANT EXECUTE ON FUNCTION public.debit_gold_coins(uuid, integer) TO service_role;
supabase/migrations/20260423140000_three_tier_coin_system.sql:180:-- Inserts performed by SECURITY DEFINER RPC / service role only
supabase/migrations/20260423140000_three_tier_coin_system.sql:183:CREATE OR REPLACE FUNCTION public.convert_gold_to_gpay_coins(
supabase/migrations/20260423140000_three_tier_coin_system.sql:188:SECURITY DEFINER
supabase/migrations/20260423140000_three_tier_coin_system.sql:248:GRANT EXECUTE ON FUNCTION public.convert_gold_to_gpay_coins(uuid, integer) TO service_role;
supabase/migrations/20260423140000_three_tier_coin_system.sql:278:CREATE OR REPLACE FUNCTION public.handle_new_user()
supabase/migrations/20260423140000_three_tier_coin_system.sql:281:SECURITY DEFINER
supabase/migrations/20260403200000_sync_users_balance_skip_without_users_table.sql:7:CREATE OR REPLACE FUNCTION public.sync_users_balance_from_wallet()
supabase/migrations/20260403200000_sync_users_balance_skip_without_users_table.sql:10:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:47:CREATE OR REPLACE FUNCTION public.garmondrop_empty_board() RETURNS jsonb
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:59:CREATE OR REPLACE FUNCTION public.garmondrop_cell(g jsonb, r int, c int) RETURNS int
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:75:CREATE OR REPLACE FUNCTION public.garmondrop_count_dir(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:98:CREATE OR REPLACE FUNCTION public.garmondrop_has_winner(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:114:CREATE OR REPLACE FUNCTION public.garmondrop_board_full(g jsonb) RETURNS boolean
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:194:CREATE OR REPLACE FUNCTION public.garmondrop_record_platform_fee(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:202:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:250:GRANT EXECUTE ON FUNCTION public.garmondrop_record_platform_fee(uuid, integer, uuid, text) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:255:CREATE OR REPLACE FUNCTION public.garmondrop_post_entry_atomic(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:264:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:373:GRANT EXECUTE ON FUNCTION public.garmondrop_post_entry_atomic(text, uuid, uuid, integer, text) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:378:CREATE OR REPLACE FUNCTION public.garmondrop_make_move_atomic(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:387:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:582:GRANT EXECUTE ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:587:CREATE OR REPLACE FUNCTION public.garmondrop_forfeit_atomic(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:594:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:678:GRANT EXECUTE ON FUNCTION public.garmondrop_forfeit_atomic(uuid, uuid, text) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:683:CREATE OR REPLACE FUNCTION public.garmondrop_cancel_waiting_atomic(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:690:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:739:GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_waiting_atomic(uuid, uuid, text) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:762:CREATE OR REPLACE FUNCTION public.garmondrop_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:765:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:797:CREATE OR REPLACE FUNCTION public.garmondrop_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:800:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:828:GRANT EXECUTE ON FUNCTION public.garmondrop_repair_turn_atomic(uuid, uuid) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:830:CREATE OR REPLACE FUNCTION public.garmondrop_make_move_atomic(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:839:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1037:GRANT EXECUTE ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1043:CREATE OR REPLACE FUNCTION public.garmondrop_cancel_room(p_room_id uuid)
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1046:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1107:GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) TO authenticated;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1108:GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1132:CREATE OR REPLACE FUNCTION public.garmondrop_record_platform_fee(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1140:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1193:CREATE OR REPLACE FUNCTION public.coin_flip_record_platform_fee(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1201:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1254:CREATE OR REPLACE FUNCTION public.celo_record_platform_fee(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1264:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1327:CREATE OR REPLACE FUNCTION public.garmondrop_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1330:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1350:CREATE OR REPLACE FUNCTION public.garmondrop_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1353:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1381:GRANT EXECUTE ON FUNCTION public.garmondrop_repair_turn_atomic(uuid, uuid) TO service_role;
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1384:CREATE OR REPLACE FUNCTION public.garmondrop_make_move_atomic(
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1393:SECURITY DEFINER
supabase/migrations/20260614120000_rename_garmonfour_to_garmondrop.sql:1591:GRANT EXECUTE ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
supabase/migrations/20260529180000_celo_bank_stop_stake_and_round_bank_snapshot.sql:9:CREATE OR REPLACE FUNCTION public.celo_post_entry_atomic(
supabase/migrations/20260529180000_celo_bank_stop_stake_and_round_bank_snapshot.sql:19:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:5:CREATE OR REPLACE FUNCTION public.garmonfour_record_platform_fee(
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:13:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:66:CREATE OR REPLACE FUNCTION public.coin_flip_record_platform_fee(
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:74:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:127:CREATE OR REPLACE FUNCTION public.celo_record_platform_fee(
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:137:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:200:CREATE OR REPLACE FUNCTION public.garmonfour_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:203:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:223:CREATE OR REPLACE FUNCTION public.garmonfour_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:226:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:254:GRANT EXECUTE ON FUNCTION public.garmonfour_repair_turn_atomic(uuid, uuid) TO service_role;
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:257:CREATE OR REPLACE FUNCTION public.garmonfour_make_move_atomic(
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:266:SECURITY DEFINER
supabase/migrations/20260613120000_fix_platform_fee_idempotency_on_conflict.sql:464:GRANT EXECUTE ON FUNCTION public.garmonfour_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
supabase/migrations/20260420150000_handle_new_user_signup_gpc_bonus.sql:4:CREATE OR REPLACE FUNCTION public.handle_new_user()
supabase/migrations/20260420150000_handle_new_user_signup_gpc_bonus.sql:7:SECURITY DEFINER
supabase/migrations/20260418120000_coin_flip.sql:47:CREATE OR REPLACE FUNCTION public.gpay_ledger_entry(
supabase/migrations/20260418120000_coin_flip.sql:56:SECURITY DEFINER
supabase/migrations/20260401000000_fix_signup_trigger.sql:79:CREATE OR REPLACE FUNCTION public.handle_new_user()
supabase/migrations/20260401000000_fix_signup_trigger.sql:82:SECURITY DEFINER
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:3:CREATE OR REPLACE FUNCTION public.garmonfour_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:6:SECURITY DEFINER
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:38:CREATE OR REPLACE FUNCTION public.garmonfour_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:41:SECURITY DEFINER
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:69:GRANT EXECUTE ON FUNCTION public.garmonfour_repair_turn_atomic(uuid, uuid) TO service_role;
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:71:CREATE OR REPLACE FUNCTION public.garmonfour_make_move_atomic(
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:80:SECURITY DEFINER
supabase/migrations/20260610120000_garmonfour_fix_null_current_turn.sql:278:GRANT EXECUTE ON FUNCTION public.garmonfour_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
supabase/migrations/20260501090000_celo_post_entry_atomic_and_orphan_reversal.sql:13:CREATE OR REPLACE FUNCTION public.celo_post_entry_atomic(
supabase/migrations/20260501090000_celo_post_entry_atomic_and_orphan_reversal.sql:23:SECURITY DEFINER
supabase/migrations/20260501090000_celo_post_entry_atomic_and_orphan_reversal.sql:155:GRANT EXECUTE ON FUNCTION public.celo_post_entry_atomic(uuid, uuid, integer, text, text, text) TO service_role;
supabase/migrations/20250250000000_production_stripe_tables.sql:99:CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
supabase/migrations/20250250000000_production_stripe_tables.sql:100:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20250250000000_production_stripe_tables.sql:111:CREATE OR REPLACE FUNCTION public.increment_balance(user_id uuid, amount numeric)
supabase/migrations/20250250000000_production_stripe_tables.sql:112:RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
supabase/migrations/20260409140001_handle_new_user_wallet_balances.sql:4:CREATE OR REPLACE FUNCTION public.handle_new_user()
supabase/migrations/20260409140001_handle_new_user_wallet_balances.sql:7:SECURITY DEFINER
supabase/migrations/20260402300000_celo_total_rounds_trigger.sql:2:CREATE OR REPLACE FUNCTION public.celo_bump_room_total_rounds()
supabase/migrations/20260402300000_celo_total_rounds_trigger.sql:5:SECURITY DEFINER
supabase/migrations/20260602120000_margin_throttle.sql:66:CREATE OR REPLACE FUNCTION public.garmon_margin_last_24h()
supabase/migrations/20260602120000_margin_throttle.sql:94:GRANT EXECUTE ON FUNCTION public.garmon_margin_last_24h() TO service_role;
supabase/migrations/20250328000001_wallet_ledger_ad_earning.sql:11:CREATE OR REPLACE FUNCTION public.wallet_ledger_entry(
supabase/migrations/20250328000001_wallet_ledger_ad_earning.sql:19:SECURITY DEFINER
supabase/migrations/20260415160000_fix_convert_gold_to_gpay_coins_null_safe.sql:4:CREATE OR REPLACE FUNCTION public.convert_gold_to_gpay_coins(
supabase/migrations/20260415160000_fix_convert_gold_to_gpay_coins_null_safe.sql:9:SECURITY DEFINER
supabase/migrations/20260503121500_celo_increment_round_banker_accounting.sql:2:CREATE OR REPLACE FUNCTION public.celo_increment_round_banker_accounting(
supabase/migrations/20260503121500_celo_increment_round_banker_accounting.sql:9:SECURITY DEFINER
supabase/migrations/20260503121500_celo_increment_round_banker_accounting.sql:22:GRANT EXECUTE ON FUNCTION public.celo_increment_round_banker_accounting(uuid, integer, integer) TO service_role;
```

## Additional review conclusions

- All 68 files under `src/app/api/admin` were checked for server role gates. The seed route is a legacy in-memory setup utility previously gated only by `ADMIN_SEED_SECRET` and the production enable flag. It now also requires an authenticated admin. All admin route files use verified `isAdmin`/`getAdminAuthUserId` gates. Admin ensure/setup also requires an authenticated admin plus its setup secret.
- `src/core/admin.ts` ID-based legacy helpers have no callers in source and are retained. Active God Mode routes now use `src/lib/admin-auth.ts`.
- `mobile/lib/core/api_client.dart` calls the retired backend reward endpoint; this now intentionally returns 410 instead of crediting arbitrary amounts.
- No in-repository caller was found for `/api/advertiser/deposit` or `/api/arena/test-meshy`.
- `/api/stripe/debug` makes no paid external call; authenticated Arena generation and 3D status routes already require verified tokens and ownership.
- The browser's `core/auth.ts` attempts a best-effort users insert/update during signup; existing server-side sync and Auth trigger perform provisioning. The prepared migration denies the direct attempts, including role/bonus/referral changes. No signup amounts or trigger bodies were changed.
- `increment_arena_coins` is called by a service-side fight route but has no definition in repository migrations; the migration also locks it if present in the deployed schema.

## Archive-backed legacy endpoint caller check

```text
backend/src/controllers/rewardsController.ts:4: /** POST /api/rewards/credit — credit reward to user wallet (e.g. after ad view). */
mobile/lib/core/api_client.dart:52: Uri.parse('$_base/api/rewards/credit'),
src/app/api/arena/test-meshy/route.ts:3: /** GET /api/arena/test-meshy — Test Meshy API connection (no auth required for diagnostics). */
```


### Production-only financial functions (October 4 read-only catalog review)

Before modifying the migration, a repository search for add_deposit, add_game_reward, handle_stripe_deposit and increment_wallet found no callers in src, backend, scripts or Supabase migrations. Production catalog definitions show arbitrary amount inputs and financial writes. All four are now included in the prepared service_role-only EXECUTE restriction; no bodies changed and no production migration applied.
