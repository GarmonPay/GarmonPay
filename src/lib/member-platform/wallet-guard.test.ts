import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { assertSessionActor, PAPER_PERSISTENCE_MESSAGE, reviewedSchemaMissing } from "./wallet-guard";

const sql = readFileSync("supabase/security/review/20261015_member_wallet_workspace.sql", "utf8");

describe("wallet member authorization", () => {
  it("rejects a staging id and a claimed member that is not the signed session", () => {
    expect(() => assertSessionActor({ sessionMemberId: "member-1", stagingId: "staging-1" })).toThrow(/staging ID/);
    expect(() => assertSessionActor({ sessionMemberId: null })).toThrow(/Connect and sign in/);
    expect(() => assertSessionActor({ sessionMemberId: "member-1", claimedMemberId: "member-2" })).toThrow(/does not match/);
    expect(assertSessionActor({ sessionMemberId: "member-1", claimedMemberId: "member-1" })).toBe("member-1");
  });

  it("treats a missing reviewed function as unavailable and records nothing", () => {
    expect(reviewedSchemaMissing({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(reviewedSchemaMissing({ message: "function gp_member_workspace does not exist" })).toBe(true);
    expect(reviewedSchemaMissing(null)).toBe(false);
    expect(PAPER_PERSISTENCE_MESSAGE).toMatch(/Nothing was recorded/);
  });
});

describe("reviewed member schema", () => {
  it("keeps the review SQL out of the applied migration path and locks the tables", () => {
    expect(sql).toContain("Do not move it into supabase/migrations");
    expect(sql).not.toMatch(/wallet_address\s+text/i);
    expect(sql).not.toContain("x-member-staging-id");
    for (const table of ["gp_member_paper_accounts", "gp_member_paper_positions", "gp_member_paper_fills", "gp_member_ad_drafts", "gp_member_audit"]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain("REVOKE ALL ON public.gp_member_paper_accounts");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).not.toMatch(/GRANT .* TO anon/i);
    expect(sql).not.toMatch(/GRANT .* TO authenticated/i);
    expect(sql).toContain("CHECK (views = 500)");
    expect(sql).toContain("CHECK (payment_enabled = false)");
    expect(sql).toContain("10000000000");
    expect(sql).toContain("Paper fills cannot be changed or deleted");
    expect(sql).toContain("Paper accounts cannot be reset");
    expect(sql).not.toMatch(/DROP TABLE public\.gp_sol_/);
  });
});
