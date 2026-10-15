"use client";
import {useLayoutEffect,useRef,useState} from 'react';
import {CeloDiceScene} from './CeloDiceScene';
import {emitCeloSound} from './celo-sound-events';
import {scheduleCeloDiceImpacts} from './celo-dice-audio';

/** Server event IDs trigger presentation; identical consecutive faces still animate once. */
export function CeloFeltDice({settled,rolling,rollKey,shooterId='',onVisualLock}:{settled:[number,number,number]|null;rolling:boolean;rollKey:string;shooterId?:string;onVisualLock?:(locked:boolean)=>void}){
 const [phase,setPhase]=useState<'rest'|'shake'|'flight'>('rest');
 const lastKey=useRef(rollKey),activeKey=useRef(''),wasRolling=useRef(false);
 const callback=useRef(onVisualLock);callback.current=onVisualLock;
 const timers=useRef<number[]>([]);
 const clear=()=>{timers.current.forEach(clearTimeout);timers.current=[];};
 useLayoutEffect(()=>{
  if(rolling&&!wasRolling.current){clear();setPhase('shake');callback.current?.(true);emitCeloSound('shake');}
  wasRolling.current=rolling;
  const newEvent=rollKey!==lastKey.current;lastKey.current=rollKey;
  const seq=Number(rollKey.split(':').pop());
  if(newEvent&&seq>0&&settled&&activeKey.current!==rollKey){
   activeKey.current=rollKey;clear();callback.current?.(true);setPhase('shake');
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const release=reduced?0:300,flight=reduced?120:1500;
   timers.current.push(window.setTimeout(()=>{setPhase('flight');emitCeloSound('release');if(!reduced)timers.current.push(...scheduleCeloDiceImpacts(1200));},release));
   timers.current.push(window.setTimeout(()=>{setPhase('rest');callback.current?.(false);emitCeloSound('land');},release+flight));
  } else if(!rolling&&phase==='shake'&&!newEvent&&activeKey.current!==rollKey){clear();setPhase('rest');callback.current?.(false);}
  // A successful roll event is authoritative even if polling missed the in-flight row.
  // Phase deliberately does not retrigger this event effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[rolling,rollKey,settled?.join(',')]);
 useLayoutEffect(()=>()=>{clear();callback.current?.(false);},[]);
 return <div className="celo-real-dice" data-celo-event={phase==='rest'?'dice-settled':'dice-throw'} data-celo-phase={phase}>
  <CeloDiceScene settled={settled} throwing={phase==='flight'} holding={phase==='shake'} variant={shooterId.length%3}/>
  {settled&&phase==='rest'?<output className="celo-server-faces" aria-label="Server dice faces">{settled.join(' · ')}</output>:null}
 </div>;
}
