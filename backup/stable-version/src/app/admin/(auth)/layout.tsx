export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17" }}>
      {children}
    </div>
  );
}
