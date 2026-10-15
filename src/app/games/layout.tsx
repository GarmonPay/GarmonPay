import { GamesRouteShell } from "@/components/games/GamesRouteShell";

export default function GamesRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GamesRouteShell>{children}</GamesRouteShell>;
}
