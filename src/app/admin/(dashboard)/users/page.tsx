"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsers() {
      const { data, error: usersError } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) {
        setError(usersError.message);
        setUsers([]);
      } else {
        setUsers((data ?? []) as UserRow[]);
        setError(null);
      }
      setLoading(false);
    }

    loadUsers();
  }, []);

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-white">Users</h1>
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111827]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Email</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Role</th>
                <th className="p-3 text-sm font-medium text-[#9ca3af]">Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-[#9ca3af]" colSpan={3}>
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="p-4 text-[#9ca3af]" colSpan={3}>
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 last:border-b-0">
                    <td className="p-3 text-white">{user.email ?? "—"}</td>
                    <td className="p-3 text-[#9ca3af]">{user.role ?? "—"}</td>
                    <td className="p-3 text-[#9ca3af]">{formatDate(user.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
