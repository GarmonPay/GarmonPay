import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { BannerRotator } from "@/components/banners/BannerRotator";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-fintech-bg" style={{ minHeight: "100vh", width: "100%", backgroundColor: "#0a0e17" }}>
      <DashboardHeader />
      <div className="flex max-w-7xl mx-auto" style={{ maxWidth: "80rem", marginLeft: "auto", marginRight: "auto" }}>
        <Sidebar />
        <main className="flex-1 min-w-0 px-4 py-6" style={{ padding: "1.5rem 1rem" }}>
          <div className="mb-6 max-w-2xl">
            <BannerRotator placement="dashboard-top" />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
