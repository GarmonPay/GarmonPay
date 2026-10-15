import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),list:vi.fn(),names:vi.fn()}));
vi.mock("@/lib/auth-request",()=>({getAuthUserId:mocks.auth}));
vi.mock("@/lib/supabase",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/watch-earn",()=>({listFeedVideos:mocks.list,getWatchPayoutGpc:async()=>17,getUserMembershipTier:async()=>"growth",getUserGpcEarnedToday:async()=>9,dailyCapForTier:()=>80}));
import {GET} from "@/app/api/earn/feed/route";
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue("viewer");mocks.list.mockResolvedValue([{id:"video",creator_id:"creator",title:"A real video",video_url:"https://fixture.invalid/video",thumbnail_url:null,views_count:12,budget_gpc:100,spent_gpc:20}]);mocks.names.mockResolvedValue({data:[{id:"creator",username:"Creator Name",full_name:"Full Name"}]});mocks.admin.mockReturnValue({from:()=>({select:()=>({in:mocks.names})})});});
describe("watch feed presentation enrichment",()=>{
 it("preserves authentication before reading creator names",async()=>{mocks.auth.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/earn/feed"))).status).toBe(401);expect(mocks.admin).not.toHaveBeenCalled();});
 it("returns real display names without changing reward amounts or limits",async()=>{const response=await GET(new Request("http://localhost/api/earn/feed"));const data=await response.json();expect(data.videos[0]).toMatchObject({creatorName:"Creator Name",payoutGpc:17,remainingBudgetGpc:80});expect(data).toMatchObject({payoutGpc:17,dailyCapGpc:80,earnedTodayGpc:9,remainingTodayGpc:71});});
 it("does not block the eligible feed when optional profile lookup fails",async()=>{mocks.names.mockRejectedValue(new Error("profile lookup failed"));const response=await GET(new Request("http://localhost/api/earn/feed"));expect(response.status).toBe(200);expect((await response.json()).videos[0]).toMatchObject({creatorName:null,payoutGpc:17});});
});
