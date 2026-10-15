/** Recovery decisions are local staging. Never release funds on a timeout alone. */
export type RecoveryObservation={
  confirmation:'missing'|'processed'|'confirmed'|'finalized'; error:unknown;
  currentBlockHeight:number; lastValidBlockHeight:number;
  historySearched:boolean; previouslyFinalized:boolean; receiptMatches:boolean;
};
export function reviewTransactionRecovery(input:RecoveryObservation){
 if(!['missing','processed','confirmed','finalized'].includes(input.confirmation) || ![input.currentBlockHeight,input.lastValidBlockHeight].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('Valid transaction observation required');
 if(input.previouslyFinalized){
  if(input.confirmation==='finalized'&&input.error===null&&input.receiptMatches)return {action:'duplicate' as const,releaseReservation:false};
  return {action:'manual_review' as const,releaseReservation:false};
 }
 if(input.confirmation==='finalized')return {action:input.error===null?(input.receiptMatches?'settle':'manual_review'):'failed_finalized',releaseReservation:false};
 if(input.confirmation==='missing' && input.historySearched && input.currentBlockHeight>input.lastValidBlockHeight)return {action:'verify_expired' as const,releaseReservation:false};
 return {action:'wait' as const,releaseReservation:false};
}
