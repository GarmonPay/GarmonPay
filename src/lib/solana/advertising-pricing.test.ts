import {describe,it,expect} from 'vitest';
import {quoteAdvertisingPurchase} from './advertising-pricing';
const base={tier:'click5' as const,views:2000,solPriceMicrousd:'100000000',rateObservedAt:100000,now:100000,pricingVersion:'illustrative_v1',viewerRewardMicrousdPerView:'300'};
describe('Approved prepaid advertising economics',()=>{
 it('keeps the $9.99 checkout floor',()=>{
  expect(quoteAdvertisingPurchase({...base,views:1000})).toMatchObject({purchaseMicrousd:'9990000',paymentEnabled:false,viewerRewardApproved:false});
  expect(quoteAdvertisingPurchase({...base,views:4000})).toMatchObject({purchaseMicrousd:'39960000',paymentEnabled:false});
 });
 it.each([['view15','19980000','3000',15,2000],['view30','14990000','3000',30,1000]] as const)('quotes approved %s tier',(tier,purchase,reward,seconds,views)=>{
  expect(quoteAdvertisingPurchase({...base,tier,views})).toMatchObject({purchaseMicrousd:purchase,viewerLamportsPerView:reward,requiredSeconds:seconds});
 });
 it('rounds promises upward and reserves referral match separately',()=>{
  const q=quoteAdvertisingPurchase({...base,views:4000,solPriceMicrousd:'123456789'});
  expect(BigInt(q.viewerReserveLamports)).toBe(BigInt(q.viewerLamportsPerView)*BigInt(4000));
  expect(BigInt(q.viewerReferralMatchLamportsPerView)*BigInt(2)).toBeGreaterThanOrEqual(BigInt(q.viewerLamportsPerView));
 });
 it.each([{views:999},{views:1001},{views:Infinity},{solPriceMicrousd:'0'},{solPriceMicrousd:'1.5'},{rateObservedAt:100001},{now:160001},{pricingVersion:''},{tier:'unapproved'},{viewerRewardMicrousdPerView:''},{viewerRewardMicrousdPerView:undefined}])('rejects unsafe quote %j',change=>{
  expect(()=>quoteAdvertisingPurchase({...base,...change} as typeof base)).toThrow();
 });
});
