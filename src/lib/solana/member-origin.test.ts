import {afterEach,describe,it,expect,vi} from 'vitest';
import {authOrigin} from './auth-crypto';
afterEach(()=>vi.unstubAllEnvs());
describe('Wallet staging origin boundary',()=>{
 it('allows only explicit loopback HTTP in nonproduction staging',()=>{
 vi.stubEnv('NODE_ENV','development');
 for(const host of ['localhost','127.0.0.1','[::1]']){vi.stubEnv('NEXT_PUBLIC_SITE_URL',`http://${host}:4326`);expect(authOrigin()).toBe(`http://${host}:4326`);}
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://staging.example.invalid');expect(()=>authOrigin()).toThrow();
 });
 it('requires HTTPS in production even for loopback',()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://127.0.0.1:4326');expect(()=>authOrigin()).toThrow();
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://garmonpay.com');expect(authOrigin()).toBe('https://garmonpay.com');
 });
});
