"use client";

export default function AdminUsersPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Users</h1>
      <p className="text-[#9ca3af] mb-6">User management. List and manage registered users.</p>
      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        <p className="text-sm text-[#9ca3af]">User list and search will appear here when connected to the backend. Use the Dashboard for recent registrations in the meantime.</p>
      </div>
    </div>
  );
}
