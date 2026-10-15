import Link from "next/link";
import { Crown } from "lucide-react";
export type GarmonPayWordmarkProps = { href?: string; className?: string };
export function GarmonPayWordmark({ href = "/", className = "" }: GarmonPayWordmarkProps) {
  return <Link href={href} className={`gp-wordmark ${className}`} aria-label="GarmonPay home"><span className="gp-brand-crown" aria-hidden><Crown/></span><span>Garmon<span>Pay</span></span></Link>;
}
