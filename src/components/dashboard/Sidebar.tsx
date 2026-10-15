"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Gamepad2, Gift, Wallet, Crown, Users, Megaphone, ShoppingBag, UserRound, Settings, LogOut } from "lucide-react";
import { signOutClient } from "@/components/dashboard/LogoutSection";
const primary = [{href:"/dashboard",label:"Home",icon:Home},{href:"/dashboard/games",label:"Games",icon:Gamepad2},{href:"/dashboard/earn",label:"Earn",icon:Gift},{href:"/dashboard/wallet",label:"Wallet",icon:Wallet},{href:"/dashboard/membership",label:"Membership",icon:Crown},{href:"/dashboard/referrals",label:"Refer",icon:Users},{href:"/dashboard/advertise",label:"Advertise",icon:Megaphone},{href:"/dashboard/coins/buy",label:"Store",icon:ShoppingBag}];
export function Sidebar({onNavigate}: {onNavigate?:()=>void}) {
 const path=usePathname();const router=useRouter();
 async function logout(){await signOutClient();onNavigate?.();router.push("/");}
 return <aside className="gp-sidebar gp-master-sidebar"><nav aria-label="Dashboard navigation"><ul>{primary.map(({href,label,icon:Icon})=>{const active=path===href||(href!=="/dashboard"&&path.startsWith(href+"/"))||(label==="Games"&&(path.startsWith("/games")||path.startsWith("/dashboard/coinflip")||path.startsWith("/dashboard/coin-flip")||path.startsWith("/dashboard/arena")));return <li key={href}><Link href={href} onClick={onNavigate} className="gp-nav-link" aria-current={active?"page":undefined}><Icon aria-hidden/><span>{label}</span></Link></li>;})}</ul></nav><div className="gp-sidebar-account"><Link href="/dashboard/profile" className="gp-nav-link" onClick={onNavigate}><UserRound/>Profile</Link><Link href="/dashboard/settings" className="gp-nav-link" onClick={onNavigate}><Settings/>Settings</Link><button onClick={()=>void logout()} className="gp-nav-link" type="button"><LogOut/>Log out</button><Link href="/dashboard/membership" className="gp-member-footer"><Crown/><span>Your membership<small>View your plan</small></span></Link></div></aside>;
}
