import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/arena/health-origin/route";
afterEach(()=>vi.unstubAllEnvs());
describe("Sanitized public worker configuration",()=>{
  it("returns only a secure public origin and never an embedded credential",async()=>{
    vi.stubEnv("NEXT_PUBLIC_FIGHT_SERVER_URL","https://username:synthetic-password@worker.example");
    vi.stubEnv("NEXT_PUBLIC_BOXING_WS_URL","wss://boxing.example");vi.stubEnv("NEXT_PUBLIC_ARENA_WS_URL","");
    const response=await GET();expect(await response.json()).toEqual({healthOrigin:"https://boxing.example"});expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns an honest null state for absent configuration",async()=>{
    for(const name of ["NEXT_PUBLIC_FIGHT_SERVER_URL","NEXT_PUBLIC_BOXING_WS_URL","NEXT_PUBLIC_ARENA_WS_URL"])vi.stubEnv(name,"");
    expect(await (await GET()).json()).toEqual({healthOrigin:null});
  });
});
