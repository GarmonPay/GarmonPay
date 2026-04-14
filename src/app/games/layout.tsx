import DashboardLayout from "@/components/layout/DashboardLayout";

export default function GamesRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
