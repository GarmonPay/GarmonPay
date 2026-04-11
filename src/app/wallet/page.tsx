import { redirect } from "next/navigation";

/** Legacy /wallet URLs redirect to dashboard wallet (GC/SC + USD). */
export default function WalletRedirectPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  const copy = ["success", "funded", "canceled"] as const;
  for (const key of copy) {
    const v = searchParams[key];
    if (typeof v === "string") q.set(key, v);
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(`/dashboard/wallet${suffix}`);
}
