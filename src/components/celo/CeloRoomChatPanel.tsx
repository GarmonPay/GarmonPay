"use client";

import type { CSSProperties } from "react";

export type ChatRow = { id: string; user_id: string; message: string; created_at: string };

type Props = {
  messages: ChatRow[];
  value: string;
  onChange: (v: string) => void;
  onSend: () => void | Promise<void>;
  canSend: boolean;
  className?: string;
  minHeightStyle?: CSSProperties;
};

/**
 * Table chat: messages from `celo_chat` + input (Supabase insert handled by parent).
 */
export function CeloRoomChatPanel({
  messages,
  value,
  onChange,
  onSend,
  canSend,
  className = "",
  minHeightStyle,
}: Props) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col border-purple-500/20 ${className}`}
      style={minHeightStyle}
    >
      <div
        className="shrink-0 border-b border-white/5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-200/80"
      >
        Chat
      </div>
      <div className="min-h-[88px] flex-1 space-y-1 overflow-y-auto px-2 py-2 text-xs">
        {messages.length === 0 ? (
          <p className="text-center text-[11px] text-white/30">No messages yet. Say something.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="text-[#9CA3AF] break-words">
              <span className="text-[#A855F7]">{(m.user_id ?? "").slice(0, 4)}</span>{" "}
              {m.message}
            </div>
          ))
        )}
      </div>
      <div className="shrink-0 flex gap-1 border-t border-white/5 p-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend) void onSend();
          }}
          className="min-h-[40px] min-w-0 flex-1 rounded border border-purple-500/30 bg-white/[0.05] px-2 text-sm text-white placeholder:text-white/30"
          placeholder="Message…"
        />
        <button
          type="button"
          className="shrink-0 rounded bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-40"
          disabled={!canSend}
          onClick={() => void onSend()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
