import Link from "next/link";
import { BrandCrown } from "@/components/BrandCrown";
export type GarmonPayWordmarkProps = { href?: string; className?: string };
export function GarmonPayWordmark({ href = "/", className = "" }: GarmonPayWordmarkProps) {
  return <Link href={href} className={`gp-wordmark ${className}`} aria-label="GarmonPay home"><span className="gp-brand-crown" aria-hidden><BrandCrown/></span><span>Garmon<span>Pay</span></span></Link>;
}
