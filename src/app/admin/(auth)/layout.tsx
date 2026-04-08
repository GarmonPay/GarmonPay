export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fintech-bg">
      {children}
    </div>
  );
}
