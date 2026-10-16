export function MemberShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="gp-member-kingdom min-h-screen text-white">
      <main id="main-content" className="gp-member-content">
        <p className="mb-6 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs leading-6 text-amber-100" role="status">Financial operations remain paused. Paper SOL is virtual and cannot be withdrawn. Your signed wallet identifies this workspace.</p>
        {children}
      </main>
    </div>
  );
}
