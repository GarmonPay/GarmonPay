/** Presentation events only. Never chooses dice, awards rewards, or calls APIs. */
export type CeloSoundEvent = "shake" | "release" | "bounce" | "collision" | "land" | "win" | "loss" | "turn";
const listeners = new Set<(event:CeloSoundEvent)=>void>();
export function subscribeCeloSound(listener:(event:CeloSoundEvent)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function emitCeloSound(event:CeloSoundEvent){listeners.forEach(listener=>{try{listener(event);}catch{/* Audio must never interrupt gameplay. */}});}
