"use client";

import Link from "next/link";

export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Notifications</h1>
      <p className="text-fintech-muted text-sm">No new notifications.</p>
      <Link
        href="/dashboard"
        className="inline-block text-fintech-accent hover:underline"
      >
        ← Dashboard
      </Link>
    </div>
  );
}
