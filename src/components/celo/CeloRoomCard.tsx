"use client";

import Link from "next/link";

export type CeloRoomCardData = {
  id: string;
  name: string;
  status: string;
  room_type?: string | null;
  max_players: number;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  current_bank_sc: number | null;
  current_bank_cents: number | null;
  banker_id: string;
};

function minEntry(r: CeloRoomCardData) {
  return r.minimum_entry_sc ?? r.min_bet_cents ?? 0;
}
function bank(r: CeloRoomCardData) {
  return r.current_bank_sc ?? r.current_bank_cents ?? 0;
}

export function CeloRoomCard({ room }: { room: CeloRoomCardData }) {
  const m = minEntry(room);
  const b = bank(room);
  return (
    <div className="mb-4 rounded-xl border border-yellow-500/20 bg-black/40 p-4 shadow-md transition hover:shadow-yellow-500/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-lg font-bold text-white">
          {room.name}
        </div>
        <div className="shrink-0 text-sm font-mono text-yellow-400">
          {room.status}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <div className="text-[10px] font-mono uppercase text-gray-500">Min entry</div>
          <div className="font-mono text-yellow-200/90">{m.toLocaleString()} GPC</div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-gray-500">Bank</div>
          <div className="font-mono text-gray-200">{b.toLocaleString()} GPC</div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-gray-500">Seats</div>
          <div className="text-gray-300">max {room.max_players}</div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase text-gray-500">Banker</div>
          <div className="truncate font-mono text-xs text-gray-400">
            {(room.banker_id ?? "—").slice(0, 6)}…
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/dashboard/games/celo/${room.id}`}
          className="min-h-[40px] flex-1 min-w-0 rounded-lg border border-purple-500/40 py-2 text-center text-xs font-bold text-violet-300 transition hover:border-violet-400 hover:bg-white/5"
        >
          Watch
        </Link>
        <Link
          href={`/dashboard/games/celo/${room.id}`}
          className="min-h-[40px] min-w-0 flex-[1.4] rounded-lg bg-gradient-to-r from-yellow-500 to-amber-600 py-2 text-center text-xs font-bold text-black shadow-md transition hover:opacity-90"
        >
          Join
        </Link>
      </div>
    </div>
  );
}
