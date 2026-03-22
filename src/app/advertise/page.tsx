import { PublicAdPackagesPage } from "@/components/advertising/PublicAdPackagesPage";

/** Canonical public URL for Supabase `ad_packages` (avoids /advertising vs /dashboard/advertise confusion). */
export default function AdvertiseLandingPage() {
  return <PublicAdPackagesPage heading="Advertising" />;
}
