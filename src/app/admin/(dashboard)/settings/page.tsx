"use client";

export default function AdminSettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-[#9ca3af] mb-6">Admin and platform settings.</p>
      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 max-w-xl">
        <h2 className="text-lg font-semibold text-white mb-2">Platform</h2>
        <p className="text-sm text-[#9ca3af] mb-4">Global platform options and feature flags can be configured here when available.</p>
        <h2 className="text-lg font-semibold text-white mb-2 mt-4">Admin</h2>
        <p className="text-sm text-[#9ca3af]">Admin session and access settings.</p>
      </div>
    </div>
  );
}
