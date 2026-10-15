import { describe,expect,it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { GAME_LOBBY } from "@/config/game-lobby";
describe("C-Lo retirement",()=>{
 it.each(["/dashboard/games/celo","/dashboard/games/celo/room-1","/games/celo","/api/celo/rooms","/api/celo/room/join","/api/celo/round/roll","/api/celo/cron/player-timeouts"])("denies retired path %s",path=>{expect(middleware(new NextRequest(`https://garmonpay.com${path}`)).status).toBe(410);});
 it("removes active catalog exposure and preserves other games",()=>{expect(GAME_LOBBY.some(g=>(g.id as string)==="celo")).toBe(false);expect(GAME_LOBBY.map(g=>g.id)).toEqual(expect.arrayContaining(["garmondrop","boxing","pinball"]));});
 it("preserves protected admin historical audit routing",()=>{expect(middleware(new NextRequest("https://garmonpay.com/admin/celo-audit")).status).toBe(307);});
});
