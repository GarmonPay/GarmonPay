import {vi,describe,it,expect} from 'vitest';
vi.mock('@/lib/solana/policy',()=>({walletAuthEnabled:()=>true}));
import {isOperationPaused,FINANCIAL_OPERATIONS_PAUSED} from './financial-pause';
describe('Reviewed member staging routes remain separate from financial activation',()=>{
 it('allows only wallet identity and member mutations in isolated authenticated staging',()=>{
 for(const [path,method] of [['/api/solana/auth/challenge','POST'],['/api/solana/auth/verify','POST'],['/api/solana/auth/event','POST'],['/api/solana/members/me','PATCH'],['/api/solana/members/follow','POST']])expect(isOperationPaused(path,method)).toBe(false);
 expect(FINANCIAL_OPERATIONS_PAUSED).toBe(true);
 for(const [path,method] of [['/api/solana/members/me','DELETE'],['/api/solana/members/follow','PATCH'],['/api/solana/auth/verify/other','POST'],['/api/solana/future-payout','POST'],['/api/wallet/fund','POST']])expect(isOperationPaused(path,method)).toBe(true);
 });
});
