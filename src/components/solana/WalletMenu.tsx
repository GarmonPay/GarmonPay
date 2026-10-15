"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wallet } from "lucide-react";
import { WalletSignIn } from "@/components/solana/WalletSignIn";
import { memberPublicLabel } from "@/lib/solana/profile-name";
import { walletAuthEnabled } from "@/lib/solana/policy";
import { classifySessionResponse } from "@/lib/solana/session-client";

export function WalletMenu() {
  const [open, setOpen] = useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const loadId=useRef(0);
  const [wallet, setWallet] = useState<string | null>(null);
  const [label, setLabel] = useState("Member");
  const [switching, setSwitching] = useState(false);
  const [error,setError] = useState("");
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (!walletAuthEnabled()) return;
    let active = true;
    const load = () => {
      const id = ++loadId.current;
      void fetch("/api/solana/auth/session", { cache: "no-store", credentials: "same-origin" }).then(async response => {
        const data = await response.json().catch(() => null);
        if (!active || id !== loadId.current) return;
        const read = classifySessionResponse(response.status, data);
        if (read.state === "active") { setWallet(read.wallet); setSwitching(false); }
        else if (read.state === "anonymous") setWallet(null);
      }).catch(() => { /* a failed check leaves the current account in place */ });
    };
    load();
    const openWallet = () => { setSwitching(false); setOpen(true); };
    window.addEventListener("garmonpay-session-change", load);
    window.addEventListener("garmonpay:open-wallet", openWallet);
    return () => { active = false; window.removeEventListener("garmonpay-session-change", load); window.removeEventListener("garmonpay:open-wallet", openWallet); };
  }, []);
  useEffect(() => {
    if (!wallet) { setLabel("Member"); return; }
    let active = true;
    void fetch("/api/solana/members/me", { cache: "no-store", credentials: "same-origin" }).then(async response => {
      const data = await response.json().catch(() => null);
      if (!active || !response.ok) return;
      setLabel(memberPublicLabel(data?.member));
    }).catch(() => { if (active) setLabel("Member"); });
    return () => { active = false; };
  }, [wallet]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !sheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open, sheet]);
  useEffect(()=>{
    if(!open)return;
    const dialog=document.getElementById('gp-wallet-dialog');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled])')??[]);
    focusable()[0]?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);setSwitching(false);trigger.current?.focus();}if(sheet&&event.key==='Tab'){const items=focusable(),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    const outside=(event:PointerEvent)=>{if(sheet)return;const target=event.target;if(!(target instanceof Node))return;if(trigger.current?.parentElement?.contains(target))return;if(dialog?.contains(target))return;setOpen(false);setSwitching(false);};
    document.addEventListener('keydown',key);
    document.addEventListener('pointerdown',outside);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
  },[open,sheet]);
  async function disconnect(switchWallet=false) {
    setError("");
    const response=await fetch("/api/solana/auth/logout", { method: "POST" }).catch(()=>null);
    if(!response?.ok){setError("Could not end your session. Please retry.");return;}
    setWallet(null);
    setSwitching(switchWallet);
    setOpen(switchWallet);
    window.dispatchEvent(new Event("garmonpay-session-change"));
  }
  if (!walletAuthEnabled()) return null;
  const close = () => { setOpen(false); setSwitching(false); };
  const menu = open ? <>
    <button type="button" className="gp-wallet-backdrop" aria-label="Close wallet menu" onClick={close} />
    <div className={sheet ? "gp-wallet-popover gp-wallet-sheet" : "gp-wallet-popover gp-wallet-dropdown"} id="gp-wallet-dialog" role="dialog" aria-modal={sheet} aria-label={wallet && !switching ? label : "Choose a wallet"}>
      {error&&<p role="alert">{error}</p>}
      {wallet && !switching ? <nav className="gp-wallet-account" aria-label="Wallet account">
        <p>{label}</p>
        <Link href="/solana/members" onClick={close}>My Profile</Link>
        <Link href="/solana/dashboard#my-coins" onClick={close}>My Coins</Link>
        <Link href="/solana/dashboard#my-holdings" onClick={close}>My Holdings</Link>
        <Link href="/solana/earn" onClick={close}>My Rewards</Link>
        <button type="button" onClick={() => void disconnect(true)}>Switch Wallet</button>
        <button type="button" onClick={() => void disconnect()}>Disconnect</button>
      </nav> : <WalletSignIn />}
    </div>
  </> : null;
  const panel = menu && sheet && typeof document !== "undefined" ? createPortal(menu, document.body) : menu;
  return <div className="gp-wallet-menu">
    <button type="button" ref={trigger} aria-controls="gp-wallet-dialog" className="gp-button gp-button-gold gp-connect-wallet" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <Wallet size={16} aria-hidden="true" />
      <span>{wallet ? label : "Connect Wallet"}</span>
    </button>
    {panel}
  </div>;
}
