"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Person = { handle: string; displayName: string; biography: string; followers: number };

export default function CommunityPage() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/member-platform/directory?q=${encodeURIComponent(query)}`);
    const body = await response.json();
    if (!response.ok) { setError("The directory could not be loaded."); return; }
    setPeople(body.members ?? []);
    setError("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold text-amber-300">Follow & Watch</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-100">Public profiles show a display name, handle, and activity the member chose to share. Wallet addresses and keys are never shown.</p>
      </header>
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
        <label className="grid flex-1 gap-1 text-sm">Search members<input value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3" /></label>
        <button type="submit" className="rounded-xl bg-amber-300 px-4 py-3 font-semibold text-black sm:self-end">Search</button>
      </form>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <li key={person.handle} className="rounded-2xl border border-white/10 bg-[#150d24] p-4">
            <Link href={`/member/community/${person.handle}`} className="text-lg font-semibold text-amber-200">{person.displayName}</Link>
            <p className="text-sm text-violet-200">@{person.handle} · {person.followers} followers</p>
            {person.biography && <p className="mt-2 text-sm text-violet-100">{person.biography}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
