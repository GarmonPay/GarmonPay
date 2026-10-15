import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/viral-referral-db", () => ({ getLeaderboard: async () => [{ rank: 1, userId: "fixture", username: "Member", email: "private@example.invalid", totalReferrals: 3, totalEarningsGpc: 0 }] }));
import { GET as general } from "@/app/api/leaderboard/route";
import { GET as referrals } from "@/app/api/referrals/leaderboard/route";
describe("Public leaderboard privacy", () => {
  it("keeps public ranking fields and removes private email from both endpoints", async () => {
    for (const response of [await general(), await referrals(new Request("https://garmonpay.com/api/referrals/leaderboard"))]) {
      const body = await response.text();
      expect(body).toContain("Member");
      expect(body).not.toContain("private@example.invalid");
      expect(body).not.toContain('"email"');
    }
  });
});
