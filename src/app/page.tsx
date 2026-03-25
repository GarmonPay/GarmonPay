import HomePageClient from "./HomePageClient";

/** Avoid stale CDN/static caching of the marketing shell in production. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <HomePageClient />;
}
