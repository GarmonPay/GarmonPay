"use client";

/** Voice room UI — wire to your provider when ready. */
export default function VoiceChat({ roomId }: { roomId: string }) {
  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-4 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-widest text-violet-400/70 mb-1">Voice chat</p>
      <p className="text-xs text-violet-300/60">Room {roomId.slice(0, 8)}… — Connect microphone in a future update.</p>
    </div>
  );
}
