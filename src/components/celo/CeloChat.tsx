"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CeloMessage } from "@/types/celo";

type Props = {
  roomId: string;
  userId: string;
  userName: string;
  messages: CeloMessage[];
  onSendMessage: (message: string) => void;
};

function displayName(m: CeloMessage): string {
  return m.user?.full_name?.trim() || m.user_name?.trim() || "Player";
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 320;
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function CeloChat({ userId, userName, messages, onSendMessage }: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canSend = useMemo(() => text.trim().length > 0 && text.length <= 200, [text]);

  function send() {
    if (!canSend) return;
    onSendMessage(text.trim());
    setText("");
  }

  return (
    <div
      aria-label={`Room chat ${roomId}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 220,
        background: "linear-gradient(180deg, rgba(15,12,28,0.98), rgba(8,6,18,0.99))",
        border: "1px solid rgba(124,58,237,0.25)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(124,58,237,0.2)",
          fontSize: 12,
          letterSpacing: "0.12em",
          color: "#c4b5fd",
          fontWeight: 700,
        }}
      >
        CHAT 💬
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m) => {
          if (m.is_system) {
            return (
              <div
                key={m.id}
                style={{
                  textAlign: "center",
                  color: "#F5C842",
                  fontSize: 12,
                  padding: "6px 8px",
                  background: "rgba(245,200,66,0.06)",
                  borderRadius: 8,
                }}
              >
                {m.message}
              </div>
            );
          }
          const display = displayName(m);
          const hue = hashHue(display);
          return (
            <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: `hsl(${hue}, 55%, 42%)`,
                  color: "#fff",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                {display[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 600 }}>{display}</span>
                  <span style={{ color: "#64748b", fontSize: 10 }}>{relTime(m.created_at)}</span>
                </div>
                <div style={{ color: "#f1f5f9", fontSize: 13, wordBreak: "break-word" }}>{m.message}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 10, borderTop: "1px solid rgba(124,58,237,0.15)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["🔥", "😂", "💀", "🎲", "💰"].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onSendMessage(e)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              {e}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Say something…"
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(124,58,237,0.25)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#e2e8f0",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            style={{
              background: canSend ? "linear-gradient(135deg,#7c3aed,#5b21b6)" : "rgba(255,255,255,0.08)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0 14px",
              fontWeight: 700,
              fontSize: 12,
              cursor: canSend ? "pointer" : "not-allowed",
            }}
          >
            SEND
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#64748b" }}>{text.length}/200 · You: {userName}</div>
      </div>
    </div>
  );
}
