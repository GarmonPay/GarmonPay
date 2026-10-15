import {describe,it,expect} from 'vitest';
import {quoteAdvertisingPurchase} from './advertising-pricing';
const base={tier:'click5' as const,views:2000,solPriceMicrousd:'100000000',rateObservedAt:100000,now:100000,pricingVersion:'approved_v1'};
describe('Approved prepaid advertising economics',()=>{
 it('keeps $5 checkout separate from $3 per thousand',()=>{
  expect(()=>quoteAdvertisingPurchase({...base,views:1000})).toThrow(/\$5/);
  expect(quoteAdvertisingPurchase(base)).toMatchObject({purchaseMicrousd:'6000000',grossLamports:'60000000',viewerLamportsPerView:'3000',viewerReferralReserveLamports:'3000000',paymentEnabled:false});
 });
 it.each([['view15','8000000','10000',15],['view30','15000000','20000',30]] as const)('quotes approved %s tier',(tier,purchase,reward,seconds)=>{
  expect(quoteAdvertisingPurchase({...base,tier,views:1000})).toMatchObject({purchaseMicrousd:purchase,viewerLamportsPerView:reward,requiredSeconds:seconds});
 });
 it('rounds promises upward and reserves referral match separately',()=>{
  const q=quoteAdvertisingPurchase({...base,solPriceMicrousd:'123456789'});
  expect(BigInt(q.viewerReserveLamports)).toBe(BigInt(q.viewerLamportsPerView)*BigInt(base.views));
  expect(BigInt(q.viewerReferralMatchLamportsPerView)*BigInt(2)).toBeGreaterThanOrEqual(BigInt(q.viewerLamportsPerView));
 });
 it.each([{views:999},{views:1001},{views:Infinity},{solPriceMicrousd:'0'},{solPriceMicrousd:'1.5'},{rateObservedAt:100001},{now:160001},{pricingVersion:''},{tier:'unapproved'}])('rejects unsafe quote %j',change=>{
  expect(()=>quoteAdvertisingPurchase({...base,...change} as typeof base)).toThrow();
 });
});
