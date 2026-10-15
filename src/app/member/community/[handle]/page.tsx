import { PublicProfile } from "./public-profile";

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <PublicProfile handle={handle} />;
}
