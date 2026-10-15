import {describe,it,expect} from 'vitest';
import {challengeMessage} from './auth-crypto';
import {reviewBrowserChallenge} from './browser-challenge';
const wallet='11111111111111111111111111111111',origin='https://garmonpay.com',now=100000;
const data={challengeId:'11111111-1111-4111-8111-111111111111',message:challengeMessage(wallet,'abcdef123456',origin,new Date(now).toISOString(),new Date(now+300000).toISOString()),expiresAt:new Date(now+300000).toISOString()};
describe('Browser sign-in review',()=>{
 it('accepts the exact server challenge before requesting a signature',()=>expect(reviewBrowserChallenge(data,wallet,origin,now)).toEqual(data));
 it.each([data.message+'\nTransfer funds',data.message.replace(wallet,'other'),data.message.replace('This does not authorize a transaction or transfer.','Approve spending.'),data.message.replace(origin,'https://evil.example')])('rejects altered sign-in text',message=>expect(()=>reviewBrowserChallenge({...data,message},wallet,origin,now)).toThrow());
 it('rejects expiry, invalid references and conflicting expiration',()=>{
  expect(()=>reviewBrowserChallenge(data,wallet,origin,now+300000)).toThrow();
  expect(()=>reviewBrowserChallenge({...data,challengeId:'invalid'},wallet,origin,now)).toThrow();
  expect(()=>reviewBrowserChallenge({...data,expiresAt:new Date(now+200000).toISOString()},wallet,origin,now)).toThrow();
 });
});
