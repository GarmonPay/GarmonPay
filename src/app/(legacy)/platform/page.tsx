import HomePageClient from "./HomePageClient";

/** Preserved marketing homepage at /platform (not the default landing). */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LegacyPlatformPage() {
  return <HomePageClient />;
}
