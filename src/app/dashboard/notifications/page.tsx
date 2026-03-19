"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getNotifications } from "@/lib/api";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [list, setList] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessionAsync().then(async (s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/notifications");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      try {
        const res = await getNotifications(tokenOrId, isToken);
        setList(res?.notifications ?? []);
      } catch {
        setList([]);
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Notifications</h1>
      <Link href="/dashboard" className="inline-block text-fintech-accent hover:underline text-sm">
        ← Dashboard
      </Link>
      {loading ? (
        <p className="text-fintech-muted text-sm">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-fintech-muted text-sm">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-4 ${n.read_at ? "border-white/5 bg-white/[0.02]" : "border-fintech-accent/30 bg-fintech-accent/5"}`}
            >
              <p className="font-medium text-white">{n.title}</p>
              {n.body && <p className="text-sm text-fintech-muted mt-1">{n.body}</p>}
              <p className="text-xs text-fintech-muted mt-2">{new Date(n.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
