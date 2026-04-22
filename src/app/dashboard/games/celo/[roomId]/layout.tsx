export const dynamic = "force-dynamic";

export default function CeloRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-[#05010F] flex flex-col text-white"
      style={{ zIndex: 20000 }}
    >
      {children}
    </div>
  );
}
