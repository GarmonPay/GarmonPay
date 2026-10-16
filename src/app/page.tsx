import type { Metadata } from "next";
import { KingdomHome } from "@/components/kingdom/home";

export const metadata: Metadata = {
  title: "Enter the Kingdom · GarmonPay",
  description: "Launch, promote, and get seen on GarmonPay. Discover coins, watch, play, and practice with virtual SOL. Purchases and Mainnet trading are paused.",
};

export default function HomePage() {
  return <KingdomHome />;
}
