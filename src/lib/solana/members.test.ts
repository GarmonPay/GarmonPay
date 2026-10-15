import {describe,it,expect,vi} from 'vitest';
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>undefined})}));
import {profileInput} from './members';
describe('Member profile request boundary',()=>{
 const valid={username:'alice',displayName:'HolyGhost',biography:'Hello',picture:null,walletPublic:false};
 it('accepts a normal display name without requiring a public handle',()=>{
  expect(profileInput({...valid,handle:''}).p_display).toBe('HolyGhost');
  expect(profileInput({...valid,handle:''}).p_username).toBeNull();
  expect(profileInput({displayName:'',biography:'',picture:null,walletPublic:false}).p_display).toBe('');
  expect(()=>profileInput({...valid,displayName:'A'})).toThrow(/2–32/);
 });
 it('validates privacy booleans and rejects reserved or malformed identities',()=>{
 expect(profileInput(valid).p_public).toBe(false);
 expect(profileInput(valid).p_display).toBe('HolyGhost');
 for(const username of ['admin','al','../../admin','аlice'])expect(()=>profileInput({...valid,username})).toThrow();
 expect(()=>profileInput({...valid,walletPublic:'false'})).toThrow();
 expect(()=>profileInput({...valid,biography:'x'.repeat(281)})).toThrow();
 });
 it('accepts a bounded real PNG while rejecting oversized dimensions',()=>{
 const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YAAAAABJRU5ErkJggg==';
 expect(profileInput({...valid,picture}).p_picture).toBe(picture);
 const bytes=Buffer.from(picture.split(',')[1],'base64');bytes.writeUInt32BE(100000,16);expect(()=>profileInput({...valid,picture:'data:image/png;base64,'+bytes.toString('base64')})).toThrow();
 });
 it('rejects scripts, remote trackers, forged raster headers and oversized pictures',()=>{
 for(const picture of ['https://tracker.invalid/me.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,aGVsbG8=','data:image/jpeg;base64,'+'a'.repeat(6000)])expect(()=>profileInput({...valid,picture})).toThrow();
 });
});
