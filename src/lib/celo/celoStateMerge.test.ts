import {describe,it,expect} from 'vitest';
import {applyCeloStateUpdate, type CeloAggregateState} from './celoStateMerge';
describe('authoritative C-Lo snapshot',()=>{
 it('replaces a future client clock with confirmed entries and a different round',()=>{
  const old:CeloAggregateState<Record<string,unknown>,{id:string;user_id:string;entry_posted:boolean},Record<string,unknown>>={updated_at:'2099-01-01',room:{id:'room',status:'waiting'},players:[{id:'p',user_id:'u',entry_posted:false}],currentRound:{id:'old',banker_dice:[6,6,6]}};
  const next=applyCeloStateUpdate(old,{room:{id:'room',status:'playing',last_activity:'2026-10-05'},players:[{id:'p',user_id:'u',entry_posted:true}],currentRound:{id:'new',status:'banker_rolling'}},'fetch',{playersSnapshot:true});
  expect(next.players[0].entry_posted).toBe(true);expect(next.room?.status).toBe('playing');expect(next.currentRound?.id).toBe('new');expect(next.currentRound?.banker_dice).toBeUndefined();
 });
});
