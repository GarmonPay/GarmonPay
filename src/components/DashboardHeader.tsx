"use client";
import Link from "next/link";
import { Bell, UserRound, Search } from "lucide-react";
import { DashboardCoinBalances } from "@/components/DashboardCoinBalances";
import { GarmonPayWordmark } from "@/components/GarmonPayWordmark";
export function DashboardHeader(){return <header className="gp-topbar"><div className="gp-topbar-inner"><GarmonPayWordmark href="/dashboard"/><div className="gp-header-wallet min-w-0"><DashboardCoinBalances compact/></div><div className="gp-header-actions"><Link href="/dashboard/games" className="gp-icon-button gp-header-search" aria-label="Browse games"><Search size={18}/></Link><Link href="/dashboard/notifications" className="gp-icon-button" aria-label="Notifications"><Bell size={18}/></Link><Link href="/dashboard/profile" className="gp-icon-button gp-header-profile" aria-label="Profile"><UserRound size={18}/><span>Profile</span></Link></div></div></header>;}
