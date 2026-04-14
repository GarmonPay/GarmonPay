import { redirect } from "next/navigation";

export default function CoinsBuyRedirectPage() {
  redirect("/dashboard/buy-coins");
}
