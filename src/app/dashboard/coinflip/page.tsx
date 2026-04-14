import { redirect } from "next/navigation";

/** Legacy URL; Coin Flip lives at `/dashboard/coin-flip`. */
export default function CoinFlipLegacyRedirectPage() {
  redirect("/dashboard/coin-flip");
}
