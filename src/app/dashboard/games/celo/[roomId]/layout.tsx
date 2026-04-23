export const dynamic = "force-dynamic";

/** Renders inside the dashboard main column so the table matches the site shell. */
export default function CeloRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex w-full min-w-0 flex-col text-white">{children}</div>;
}
