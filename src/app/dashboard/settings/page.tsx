"use client";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <h1 className="text-xl font-bold text-white mb-2">Settings</h1>
        <p className="text-fintech-muted mb-6">Account and security settings.</p>
        <div className="rounded-lg bg-black/20 border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Account</h2>
          <p className="text-sm text-fintech-muted">Email and profile updates will be available here soon.</p>
        </div>
        <div className="mt-4 rounded-lg bg-black/20 border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Security</h2>
          <p className="text-sm text-fintech-muted">Password change and two-factor options will appear here.</p>
        </div>
      </div>
    </div>
  );
}
