"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {SolanaSurface,FeatureStatus} from './SolanaSurface';
import {Notice,WorkspaceTabs} from './WorkspaceUI';
const packages=[
 {id:'seconds5',name:'5 seconds',price:6.99},
 {id:'seconds15',name:'15 seconds',price:9.99},
 {id:'seconds30',name:'30 seconds',price:14.99},
 {id:'seconds60',name:'60 seconds',price:24.99},
];
type Draft={title:string;url:string;format:string;views:string};
const initial:Draft={title:'',url:'',format:'seconds15',views:'500'};
const key='garmonpay-advertising-plan-v2';
export function reviewAdvertisingPlan(draft:Draft){
 const tier=packages.find(p=>p.id===draft.format);
 if(!tier||draft.views!=='500')throw new Error('Each package is 500 verified views or clicks.');
 if(!draft.title.trim()||draft.title.length>80)throw new Error('Enter a campaign name.');
 let url:URL;try{url=new URL(draft.url);}catch{throw new Error('Use a valid HTTPS destination.');}
 if(url.protocol!=='https:'||url.username||url.password||draft.url.length>200)throw new Error('Use an HTTPS destination without embedded credentials.');
 return {tier,views:500,total:tier.price};
}
export function AdvertisingPlanner({initialTab="Packages"}:{initialTab?:string}={}){
 const [tab,setTab]=useState(initialTab),[draft,setDraft]=useState<Draft>(initial),[stored,setStored]=useState<Draft|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{try{const raw=localStorage.getItem(key);if(!raw||raw.length>5000)return;const value=JSON.parse(raw);if(['title','url','format','views'].every(k=>typeof value?.[k]==='string')){reviewAdvertisingPlan(value);setStored(value);}}catch{/* Unusable stored drafts are ignored. */}},[]);
 const tier=packages.find(p=>p.id===draft.format)||packages[1];
 function updateDraft(change:Partial<Draft>){setDraft({...draft,...change});setMessage('');setError('');}
 function save(event:React.FormEvent){event.preventDefault();setError('');setMessage('');try{reviewAdvertisingPlan(draft);const clean={...draft,title:draft.title.trim(),views:'500'};localStorage.setItem(key,JSON.stringify(clean));setDraft(clean);setStored(clean);setMessage('Draft saved on this device. No campaign was submitted and no payment was made.');}catch(e){setError(e instanceof Error?e.message:'Unable to save the draft in this browser.');}}
 return <>
 <div className="gp-workspace-feature-bar"><span>One-time prepaid advertising · no subscription</span><span>Package size <strong>500</strong> verified views or clicks</span></div>
 <WorkspaceTabs label="Advertising workspace" options={['Packages','Plan a campaign','Saved draft','Campaign activity']} value={tab} onChange={value=>{setTab(value);setError('');setMessage('');}}/>
 {tab==='Packages'&&<><div className="gp-sol-grid">{packages.map(p=><SolanaSurface key={p.id} title={p.name} className={p.id==='seconds15'?'gp-package-highlight':''}><FeatureStatus>Approved pricing · funding paused</FeatureStatus><p className="gp-package-price">${p.price.toFixed(2)}<small> / 500 verified views or clicks</small></p><p className="gp-sol-muted">No per-view dollar reward is configured. Payment is off.</p><button className="gp-button gp-sol-section-space" type="button" onClick={()=>{setDraft({...draft,format:p.id,views:'500'});setTab('Plan a campaign');}}>Plan {p.name}</button></SolanaSurface>)}</div><p className="gp-sol-disclosure">Packages are 5 seconds for $6.99, 15 seconds for $9.99, 30 seconds for $14.99, and 60 seconds for $24.99. Funding remains paused.</p></>}
 {tab==='Plan a campaign'&&<div className="gp-sol-grid gp-sol-grid-two"><SolanaSurface title="Plan your campaign" description="Build a draft and save it on this device. Nothing is submitted or charged."><form onSubmit={save} className="gp-workspace-form"><label>Campaign name<input required maxLength={80} value={draft.title} onChange={e=>updateDraft({title:e.target.value})}/></label><label>Destination (HTTPS)<input type="url" required maxLength={200} placeholder="https://" value={draft.url} onChange={e=>updateDraft({url:e.target.value})}/></label><label>Package<select value={draft.format} onChange={e=>updateDraft({format:e.target.value,views:'500'})}>{packages.map(p=><option key={p.id} value={p.id}>{p.name} · ${p.price.toFixed(2)}</option>)}</select></label><p className="gp-sol-muted">Package size is fixed at 500 verified views or clicks.</p>{error&&<Notice error>{error}</Notice>}<button type="submit" className="gp-button gp-button-gold">Save draft on this device</button>{message&&<Notice>{message}</Notice>}</form></SolanaSurface><SolanaSurface title="Your package"><div className="gp-workspace-summary"><span>Duration<strong>{tier.name}</strong></span><span>Views or clicks<strong>500</strong></span><span>Package price<strong>${tier.price.toFixed(2)}</strong></span><span>Payment status<strong>Funding paused</strong></span></div><p className="gp-sol-muted">This is the approved package price, not a payable SOL quote. Signed-in members can keep a server draft from My Dashboard after the reviewed database is approved.</p><p className="gp-sol-disclosure"><Link href="/member/advertising">Open member advertising</Link></p></SolanaSurface></div>}
 {tab==='Saved draft'&&<SolanaSurface title="Your saved campaign plan" description="Saved locally in this browser until a signed member draft is stored.">{stored?<><div className="gp-workspace-summary"><span>Campaign<strong>{stored.title}</strong></span><span>Destination<strong>{stored.url}</strong></span><span>Package<strong>${reviewAdvertisingPlan(stored).total.toFixed(2)}</strong></span></div><button type="button" className="gp-button gp-sol-section-space" onClick={()=>{setDraft(stored);setTab('Plan a campaign');}}>Edit saved draft</button></>:<p className="gp-sol-muted">No saved draft in this browser. Choose a package to start your plan.</p>}</SolanaSurface>}
 {tab==='Campaign activity'&&<SolanaSurface title="Campaign activity" description="Advertising charges stay paused. A device draft is not a funded campaign."><Link href="/member/advertising" className="gp-button">Open member advertising</Link><p className="gp-sol-disclosure">No new campaign has been funded or activated by this planner.</p></SolanaSurface>}
 </>;
}
