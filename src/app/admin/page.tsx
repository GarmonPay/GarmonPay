"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin")
      .then((res) => res.json())
      .then(setData);
  }, []);

  return (
    <div className="min-h-screen bg-fintech-bg p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Revenue Dashboard</h1>
      {Array.isArray(data) && data.length === 0 && (
        <p className="text-fintech-muted">No revenue transactions yet.</p>
      )}
      {Array.isArray(data) &&
        data.map((item, i) => (
          <div key={item.id ?? i} className="py-2 border-b border-white/10 text-white">
            {item.email} — ${Number(item.amount).toFixed(2)} ({item.type})
          </div>
        ))}
    </div>
  );
}
