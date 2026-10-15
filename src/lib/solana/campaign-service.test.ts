import {describe,it,expect,vi} from 'vitest';
import {fundSessionCampaign,claimSessionView,type CampaignStore} from './campaign-service';
const campaign='00000000-0000-4000-8000-000000000001',receipt='00000000-0000-4000-8000-000000000002',wallet='11111111111111111111111111111111';
const fixture=():CampaignStore=>({getApprovedQuote:vi.fn(async()=>({data:{reward_lamports:'100',seconds:15,daily_limit:10},error:null})),fundCampaign:vi.fn(async()=>({data:campaign,error:null})),claimView:vi.fn(async()=>({data:receipt,error:null}))});
describe('Authenticated campaign backend orchestration',()=>{
 it('retrieves trusted owned quote and passes no browser financial terms',async()=>{
  const store=fixture();await fundSessionCampaign(store,{wallet},{campaignId:campaign,receiptId:receipt});
  expect(store.getApprovedQuote).toHaveBeenCalledWith(campaign,wallet);
  expect(store.fundCampaign).toHaveBeenCalledWith({p_campaign:campaign,p_receipt:receipt,p_reward:'100',p_seconds:15,p_daily_limit:10});
 });
 it('claims solely for the verified session identity',async()=>{const store=fixture();await claimSessionView(store,{wallet},receipt);expect(store.claimView).toHaveBeenCalledWith({p_proof:receipt,p_viewer:wallet});});
 it('denies invalid references before database access',async()=>{const store=fixture();await expect(fundSessionCampaign(store,{wallet},{campaignId:'bad',receiptId:receipt})).rejects.toThrow();expect(store.getApprovedQuote).not.toHaveBeenCalled();});
 it('refuses missing ownership and hides database errors',async()=>{
  const store=fixture();store.getApprovedQuote=async()=>({data:null,error:'private-error'});await expect(fundSessionCampaign(store,{wallet},{campaignId:campaign,receiptId:receipt})).rejects.toThrow('Owned approved campaign unavailable');expect(store.fundCampaign).not.toHaveBeenCalled();
 });
});
