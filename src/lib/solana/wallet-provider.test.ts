import {describe,it,expect,vi} from 'vitest';
import {connectWallet,connectWithDeadline,signWithDeadline,walletSignature,type WalletProvider} from './wallet-provider';
describe('Desktop and wallet-browser provider response compatibility',()=>{
 const address='11111111111111111111111111111111';
 it('supports connected public keys returned by Phantom or held on the provider',async()=>{
 const provider={connect:async()=>({publicKey:{toString:()=>address}})} as WalletProvider;
 expect(await connectWallet(provider)).toBe(address);
 expect(await connectWallet({...provider,connect:async()=>{},publicKey:{toString:()=>address}})).toBe(address);
 await expect(connectWallet({...provider,connect:async()=>{},publicKey:null})).rejects.toThrow();
 });
 it('resolves, rejects, and times out connect and signMessage',async()=>{
  const provider={connect:async()=>({publicKey:{toString:()=>address}}),signMessage:async()=>new Uint8Array(64),disconnect:async()=>{}} as WalletProvider;
  expect(await connectWithDeadline(provider,30)).toEqual({publicKey:{toString:expect.any(Function)}});
  await expect(connectWithDeadline({...provider,connect:async()=>{throw new Error('rejected');}},30)).rejects.toThrow(/rejected/);
  vi.useFakeTimers();
  const hanging=connectWithDeadline({...provider,connect:()=>new Promise(()=>{})},20);
  const signHanging=signWithDeadline({...provider,signMessage:()=>new Promise(()=>{})},new Uint8Array([1]),20);
  const connectTimeout=expect(hanging).rejects.toThrow(/did not answer the connection request/);
  const signTimeout=expect(signHanging).rejects.toThrow(/did not answer the sign-in request/);
  await vi.advanceTimersByTimeAsync(20);
  await connectTimeout;
  await signTimeout;
  vi.useRealTimers();
 });
 it('supports object and raw-byte signatures while rejecting wrong lengths',()=>{
 const bytes=new Uint8Array(64);expect(walletSignature(bytes)).toBe(bytes);expect(walletSignature({signature:bytes})).toBe(bytes);
 expect(()=>walletSignature(new Uint8Array(63))).toThrow();
 });
});
