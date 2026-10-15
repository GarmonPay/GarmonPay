"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { subscribeCeloSound, type CeloSoundEvent } from "./celo-sound-events";
import { subscribeCeloDiceImpact } from "./celo-dice-audio";
/** Small synthesized sounds: no downloads, paid services, or autoplay. */
export function CeloSoundControl({turnKey,resultKey,outcome}:{turnKey:string;resultKey?:string;outcome?:"win"|"loss"}){
 const [enabled,setEnabled]=useState(false);const enabledRef=useRef(false);const contextRef=useRef<AudioContext|null>(null);
 const previousTurn=useRef(turnKey);const previousResult=useRef(resultKey);
 function play(event:CeloSoundEvent){
  const context=contextRef.current;if(!enabledRef.current||!context||context.state!=="running")return;
  const start=context.currentTime;
  const tone=(hz:number,at:number,length:number,volume:number,type:OscillatorType="sine")=>{const oscillator=context.createOscillator();const gain=context.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(hz,start+at);gain.gain.setValueAtTime(.001,start+at);gain.gain.exponentialRampToValueAtTime(volume,start+at+.01);gain.gain.exponentialRampToValueAtTime(.001,start+at+length);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start+at);oscillator.stop(start+at+length);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};};
  if(event==="win"){[392,494,587,784].forEach((hz,i)=>tone(hz,i*.11,.24,.035));return;}
  if(event==="loss"){tone(240,0,.18,.025);tone(160,.15,.25,.025);return;}
  if(event==="turn"){tone(660,0,.09,.02);tone(880,.08,.1,.02);return;}
  if(event==="shake"){for(let i=0;i<7;i++)tone(160+i%3*65,i*.10,.055,.015,"triangle");return;}
  tone(event==="collision"?950:event==="release"?330:event==="land"?100:180,0,event==="land"?.16:.055,event==="collision"?.02:.03,"triangle");
 }
 const playRef=useRef(play);playRef.current=play;
 useEffect(()=>{const off=subscribeCeloSound(event=>playRef.current(event));const impacts=subscribeCeloDiceImpact(kind=>{if(kind!=="settle")playRef.current(kind==="rail"?"collision":"bounce");});return ()=>{off();impacts();void contextRef.current?.close();contextRef.current=null;};},[]);
 useEffect(()=>{if(turnKey!==previousTurn.current){if(previousTurn.current&&turnKey)playRef.current("turn");previousTurn.current=turnKey;}},[turnKey]);
 useEffect(()=>{if(resultKey&&resultKey!==previousResult.current&&outcome)playRef.current(outcome);if(outcome || !resultKey) previousResult.current=resultKey;},[resultKey,outcome]);
 async function toggle(){
  if(enabledRef.current){enabledRef.current=false;setEnabled(false);await contextRef.current?.suspend();return;}
  try{const context=contextRef.current??new AudioContext();contextRef.current=context;await context.resume();enabledRef.current=true;setEnabled(true); }catch{enabledRef.current=false;setEnabled(false);}
 }
 return <button type="button" onClick={()=>void toggle()} className="gp-sound-toggle" aria-pressed={enabled} aria-label={enabled?"Turn dice sound off":"Turn dice sound on"}>{enabled?<Volume2 size={16}/>:<VolumeX size={16}/>}<span>Sound {enabled?"ON":"OFF"}</span></button>;
}
