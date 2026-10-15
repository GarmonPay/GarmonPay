"use client";
import { useState } from "react";
export function PlayerAvatar({name,url,violet=false}:{name:string;url?:string|null;violet?:boolean}){const [failed,setFailed]=useState(false);return <span className={`gp-player-avatar ${violet?"gp-player-violet":""}`} aria-label={`${name} avatar`}>{url&&!failed?<img src={url} alt="" width={44} height={44} loading="lazy" decoding="async" onError={()=>setFailed(true)} className="h-full w-full rounded-[inherit] object-cover"/>:name.slice(0,1).toUpperCase()}</span>;}
