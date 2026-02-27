"use client";

import { useEffect, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type AdminUser = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
};

export default function AdminUsersPage() {
  const session = getAdminSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.adminId) {
      setLoading(false);
      setError("Admin session missing");
      return;
    }

    const controller = new AbortController();
    const loadUsers = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/admin/users`, {
          headers: { "X-Admin-Id": session.adminId },
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          users?: AdminUser[];
          message?: string;
        };
        if (!res.ok) {
          throw new Error(data.message ?? "Failed to load users");
        }
        setUsers(Array.isArray(data.users) ? data.users : []);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    };

    void loadUsers();
    return () => controller.abort();
  }, [session?.adminId]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Users</h1>
      <p className="text-[#9ca3af] mb-6">User management. List and manage registered users.</p>
      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        {loading ? (
          <p className="text-sm text-[#9ca3af]">Loading users…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[#9ca3af] border-b border-white/10">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2">User ID</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 text-white">
                    <td className="py-2 pr-4">{user.email ?? "unknown"}</td>
                    <td className="py-2 pr-4 capitalize">{user.role ?? "user"}</td>
                    <td className="py-2 pr-4">
                      {user.created_at ? new Date(user.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 font-mono text-xs text-[#9ca3af]">{user.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
