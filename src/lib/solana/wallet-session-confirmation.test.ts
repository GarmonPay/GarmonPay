import {describe,it,expect} from 'vitest';
import {confirmWalletSession} from './wallet-session-confirmation';
describe('browser session establishment',()=>{
 it('accepts only the cookie-backed expected wallet',async()=>{await expect(confirmWalletSession('wallet-a',async()=>new Response(JSON.stringify({wallet:'wallet-a'})))).resolves.toBeUndefined();});
 it('rejects a lost cookie or a different member session',async()=>{for(const response of [new Response('{}',{status:401}),new Response('invalid')])await expect(confirmWalletSession('wallet-a',async()=>response)).rejects.toThrow('did not retain');});
 it('distinguishes unavailable storage from a changed wallet session',async()=>{
  await expect(confirmWalletSession('wallet-a',async()=>new Response('{}',{status:503}))).rejects.toThrow('SESSION_LOOKUP');
  await expect(confirmWalletSession('wallet-a',async()=>new Response(JSON.stringify({wallet:'wallet-b'})))).rejects.toThrow('SESSION_WALLET_CHANGED');
 });
});
