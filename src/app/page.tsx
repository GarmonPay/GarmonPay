import HomePageClient from "./HomePageClient";

/** Avoid stale CDN/static caching of the marketing shell in production. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  const deployStamp = new Date().toISOString();
  return (
    <>
      <div
        className="w-full border-b border-amber-500/40 bg-amber-950/80 px-3 py-2 text-center font-mono text-[11px] tracking-wide text-amber-100"
        data-deploy-marker="true"
      >
        DEPLOY TEST — {deployStamp}
      </div>
      <HomePageClient />
    </>
  );
}
