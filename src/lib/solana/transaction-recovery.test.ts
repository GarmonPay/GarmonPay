import {describe,it,expect} from 'vitest';
import {reviewTransactionRecovery,type RecoveryObservation} from './transaction-recovery';
const base:RecoveryObservation={confirmation:'missing',error:null,currentBlockHeight:100,lastValidBlockHeight:110,historySearched:true,previouslyFinalized:false,receiptMatches:true};
describe('Transaction recovery safety',()=>{
 it.each(['missing','processed','confirmed'] as const)('holds funds while %s',confirmation=>expect(reviewTransactionRecovery({...base,confirmation})).toEqual({action:'wait',releaseReservation:false}));
 it('requires expiry verification rather than releasing on timeout',()=>expect(reviewTransactionRecovery({...base,currentBlockHeight:111})).toEqual({action:'verify_expired',releaseReservation:false}));
 it('holds on finalized failure pending recovery proof',()=>expect(reviewTransactionRecovery({...base,confirmation:'finalized',error:{failed:true}}).action).toBe('failed_finalized'));
 it('settles only matching successful finality',()=>{expect(reviewTransactionRecovery({...base,confirmation:'finalized'}).action).toBe('settle');expect(reviewTransactionRecovery({...base,confirmation:'finalized',receiptMatches:false}).action).toBe('manual_review');});
 it('treats repeat finality as duplicate and conflicting reversal as manual review',()=>{expect(reviewTransactionRecovery({...base,confirmation:'finalized',previouslyFinalized:true}).action).toBe('duplicate');expect(reviewTransactionRecovery({...base,previouslyFinalized:true}).action).toBe('manual_review');});
});
