"use client";

/** Voice room UI — wire to your provider when ready. */
export default function VoiceChat({
  roomId,
  userId,
  userName,
  role,
}: {
  roomId: string;
  userId?: string;
  userName?: string;
  role?: string;
}) {
  const extra =
    userName || userId || role
      ? ` · ${[userName, role].filter(Boolean).join(" · ")}`
      : "";
  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-4 backdrop-blur-sm">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-violet-400/70">Voice chat</p>
      <p className="text-xs text-violet-300/60">
        Room {roomId.slice(0, 8)}…{extra} — Connect microphone in a future update.
      </p>
    </div>
  );
}
