import { describe, expect, it } from "vitest";
import { modelCampaignEconomics } from "./advertising";
const scenario={grossMicrousd:BigInt(9990000),views:1000,viewerMicrousdPerView:BigInt(3000),advertiserBps:1000 as const,processorBps:300,processorFlatMicrousd:BigInt(300000),operatingMicrousd:BigInt(750000),reserveBps:500};
describe("unapproved advertising profitability scenarios",()=>{
 it("reserves every referred viewer and first-purchase commission without activation",()=>{
  expect(modelCampaignEconomics(scenario)).toMatchObject({viewerMicrousd:BigInt(3000000),viewerMatchMicrousd:BigInt(1500000),advertiserMicrousd:BigInt(999000),processingMicrousd:BigInt(599700),reserveMicrousd:BigInt(499500),netMicrousd:BigInt(2641800),assumptionsApproved:false,paymentEnabled:false,payoutsEnabled:false});
 });
 it("models subsequent-purchase commission separately",()=>{
  expect(modelCampaignEconomics({...scenario,advertiserBps:500})).toMatchObject({advertiserMicrousd:BigInt(499500),netMicrousd:BigInt(3141300)});
 });
 it("exposes a deficit rather than silently reducing promised viewer earnings",()=>{
  const result=modelCampaignEconomics({...scenario,viewerMicrousdPerView:BigInt(10000)});
  expect(result.coversAssumptions).toBe(false);expect(result.netMicrousd).toBeLessThan(BigInt(0));expect(result.viewerMicrousd).toBe(BigInt(10000000));
 });
 it("rounds fractional match obligations upward and rejects unsafe inputs",()=>{
  expect(modelCampaignEconomics({...scenario,viewerMicrousdPerView:BigInt(3001)}).viewerMatchMicrousd).toBe(BigInt(1501000));
  expect(()=>modelCampaignEconomics({...scenario,processorBps:NaN})).toThrow();
  expect(()=>modelCampaignEconomics({...scenario,viewerMicrousdPerView:BigInt(-1)})).toThrow();
 });
});
