import { redirect } from "next/navigation";

/** Legacy /wallet URLs redirect to dashboard wallet (GC, GPC, $GPAY). */
export default async function WalletRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const q = new URLSearchParams();
  const copy = ["success", "funded", "canceled"] as const;
  for (const key of copy) {
    const v = resolved[key];
    if (typeof v === "string") q.set(key, v);
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(`/dashboard/wallet${suffix}`);
}
