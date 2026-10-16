"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {SolanaSurface,FeatureStatus} from './SolanaSurface';
import {DevnetCoinShelf} from './DevnetCoinShelf';
import {DevnetHoldings} from './DevnetHoldings';
import {reviewAdvertisingPlan} from './AdvertisingPlanner';
import {validateTokenMetadata} from '@/lib/solana/token-metadata';
const keys=['garmonpay-free-learning-v1','garmonpay-advertising-plan-v2','garmonpay-project-plan-v1'];
function stored(key:string){const raw=localStorage.getItem(key);return raw&&raw.length<=5000?JSON.parse(raw):null;}
export function DashboardStarter(){
 const [snapshot,setSnapshot]=useState<{courses:number;campaign:string|null;project:string|null;readable:boolean}|null>(null);
 useEffect(()=>{
  function refresh(){let courses=0,campaign:string|null=null,project:string|null=null,readable=true;
   try{const learning=stored(keys[0]);if(Array.isArray(learning))courses=['wallet','transactions','rewards'].filter(id=>learning.includes(id)).length;}catch{readable=false;}
   try{const plan=stored(keys[1]);if(['title','url','format','views'].every(key=>typeof plan?.[key]==='string')){reviewAdvertisingPlan(plan);campaign=plan.title.trim();}}catch{readable=false;}
   try{const plan=stored(keys[2]);if(plan)project=validateTokenMetadata(plan).name;}catch{readable=false;}
   setSnapshot({courses,campaign,project,readable});
  }
  refresh();const changed=(event:StorageEvent)=>{if(event.key===null||keys.includes(event.key))refresh();};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
 },[]);
 return <>
 <div className="gp-workspace-feature-bar"><span>Start using GarmonPay today</span><FeatureStatus>Free features available · financial operations paused</FeatureStatus></div>
 <div className="gp-sol-grid">
 <SolanaSurface title="Free learning" description="Three practical courses, knowledge checks and device-saved progress."><p className="gp-sol-muted" role="status">{snapshot? snapshot.courses?`${snapshot.courses} of 3 courses saved as completed on this device`:'No course progress saved on this device':'Checking saved learning progress…'}</p><Link href="/solana/learn" className="gp-button gp-button-gold gp-sol-section-space">Open free courses</Link></SolanaSurface>
 <SolanaSurface title="Advertising plans" description="Compare packages and plan a campaign without making a payment."><p className="gp-sol-muted" role="status">{snapshot?snapshot.campaign?`Saved draft: ${snapshot.campaign}`:'No advertising draft saved on this device':'Checking saved campaign plans…'}</p><Link href={snapshot?.campaign?'/solana/advertise?plan=1':'/solana/advertise'} className="gp-button gp-button-gold gp-sol-section-space">{snapshot?.campaign?'Open saved campaign plan':'Plan a campaign'}</Link></SolanaSurface>
 <div id="my-coins"><SolanaSurface title="My Coins" description="Devnet coins confirmed for the wallet you are signed in with, including curve status, launch time, and accrued creator fees."><DevnetCoinShelf mine /></SolanaSurface></div>
 <div id="my-holdings"><SolanaSurface title="My Holdings" description="GarmonPay coin balances in the connected wallet. Created coins stay in My Coins even when this balance is zero."><DevnetHoldings /></SolanaSurface></div>
 <SolanaSurface title="Create a coin" description="Launch a Devnet test token. Mainnet trading stays closed."><p className="gp-sol-muted" role="status">{snapshot?snapshot.project?`Saved project: ${snapshot.project}`:'No project draft saved on this device':'Checking saved project details…'}</p><Link href="/solana/create" className="gp-button gp-button-gold gp-sol-section-space">Create Coin</Link></SolanaSurface>
 </div>
 {snapshot&&!snapshot.readable&&<p className="gp-sol-muted" role="status">Some saved browser data could not be read. The features above remain available.</p>}
 <p className="gp-sol-disclosure">These summaries come from saved data on this device. They are not account balances, submitted campaigns, verified reward eligibility or on-chain transactions.</p>
 <div className="gp-sol-grid gp-sol-grid-two gp-sol-section-space"><SolanaSurface title="Play free Connect Four" description="Two players on the same device. No account, entry fee, prize or cash reward."><Link href="/games/connect-four" className="gp-button gp-button-gold gp-sol-section-space">Play free Connect Four</Link></SolanaSurface><SolanaSurface title="Your existing account" description="Older account records remain in that dashboard, separate from new SOL activity."><div className="gp-sol-actions gp-sol-section-space"><Link href="/dashboard" className="gp-button">Open existing account</Link><Link href="/dashboard/settings" className="gp-button">Account settings</Link></div></SolanaSurface></div>
 <SolanaSurface title="Financial availability" description="Mainnet trading, campaign payments, funded rewards, and withdrawals remain paused. Devnet test coins use Devnet SOL only." className="gp-sol-section-space"><div className="gp-sol-actions"><Link href="/solana/create" className="gp-button">Create Coin</Link><Link href="/solana/referrals" className="gp-button">Referral programs</Link></div></SolanaSurface>
 </>;
}
