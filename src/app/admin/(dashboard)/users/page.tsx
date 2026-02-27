"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

interface AdminUser {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
}

interface AdminUsersResponse {
  totalUsers?: number;
  users?: AdminUser[];
  message?: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AdminUsersPage() {
  const session = useMemo(() => getAdminSession(), []);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const adminId = session?.adminId;

    if (!adminId) {
      setError("Admin session not found.");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const adminIdHeader: string = adminId;

    async function loadUsers() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/admin/users`, {
          headers: { "X-Admin-Id": adminIdHeader },
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as AdminUsersResponse;
        if (!res.ok) {
          throw new Error(body.message ?? "Failed to load users");
        }
        const rows = Array.isArray(body.users) ? body.users : [];
        if (cancelled) return;
        setUsers(rows);
        setTotalUsers(typeof body.totalUsers === "number" ? body.totalUsers : rows.length);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load users");
        setUsers([]);
        setTotalUsers(0);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Users</h1>
      <p className="text-[#9ca3af] mb-6">User management. List and manage registered users.</p>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-5 mb-6">
        <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Users</p>
        <p className="text-2xl font-bold text-white mt-1">{totalUsers.toLocaleString()}</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400 mb-6">
          {error}
        </div>
      )}

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        {loading ? (
          <p className="text-sm text-[#9ca3af]">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#9ca3af] border-b border-white/10">
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 pr-3 font-medium">User ID</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-3 text-white">{u.email ?? "Unknown email"}</td>
                    <td className="py-2 pr-3 text-[#9ca3af] capitalize">{u.role ?? "member"}</td>
                    <td className="py-2 pr-3 text-[#9ca3af]">{formatDate(u.created_at)}</td>
                    <td className="py-2 pr-3 text-[#6b7280]">{u.id}</td>
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
