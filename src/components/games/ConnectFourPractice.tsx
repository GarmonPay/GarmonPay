"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {dropPracticeDisc,emptyPracticeBoard} from '@/lib/games/connect-four-practice';
export function ConnectFourPractice(){
 const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
 const [game,setGame]=useState<{board:number[][];player:1|2;winner:number|null;draw:boolean}>(()=>({board:emptyPracticeBoard(),player:1,winner:null,draw:false}));
 const {board,player,winner,draw}=game;
 function play(column:number){if(!ready)return;setGame(previous=>{if(previous.winner||previous.draw)return previous;const move=dropPracticeDisc(previous.board,column,previous.player);if(!move)return previous;return {...move,player:move.winner||move.draw?previous.player:previous.player===1?2:1};});}
 function reset(){setGame({board:emptyPracticeBoard(),player:1,winner:null,draw:false});}
 return <section><p className="gp-sol-eyebrow">GARMONPAY / FREE PLAY</p><h1>Connect Four practice</h1><p className="gp-sol-muted">Two players. One device. No account, entry fee, prize or cash reward.</p>
 <div className="gp-sol-panel gp-sol-section-space" style={{maxWidth:640,marginInline:'auto'}}><h2 role="status" aria-live="polite">{!ready?"Getting the board ready…":winner?`${winner===1?'Gold':'Purple'} wins!`:draw?'The board is full — draw.':`${player===1?'Gold':'Purple'}’s turn`}</h2>
 <p className="gp-sol-muted">Choose a column to drop a disc. Connect four horizontally, vertically or diagonally.</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:6,marginTop:20}}>{Array.from({length:7},(_,column)=><button key={column} type="button" aria-label={`Drop disc in column ${column+1}`} className="gp-button" style={{minWidth:0,padding:'10px 0'}} disabled={!ready||!!winner||draw||board[0][column]!==0} onClick={()=>play(column)}>{column+1}</button>)}</div>
 <div role="grid" aria-label="Connect Four board" style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:6,marginTop:10,padding:8,borderRadius:16,background:'#321456'}}>{board.map((row,r)=>row.map((cell,c)=><div role="gridcell" aria-label={`Row ${r+1}, column ${c+1}: ${cell===1?'gold':cell===2?'purple':'empty'}`} key={`${r}-${c}`} style={{aspectRatio:'1',borderRadius:'50%',background:cell===1?'#f5c84c':cell===2?'#b279ff':'#140b22',boxShadow:'inset 0 2px 5px #0005'}}/>))}</div>
 <div className="gp-sol-actions gp-sol-section-space"><button type="button" className="gp-button gp-button-gold" disabled={!ready} onClick={reset}>Start a new game</button><Link href="/games" className="gp-button">Back to games</Link></div></div>
 <p className="gp-sol-disclosure">Practice happens entirely on this device. It does not affect your account or existing game history. Online account games remain separate; their financial operations are paused.</p></section>;
}
