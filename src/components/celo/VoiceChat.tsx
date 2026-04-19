"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgoraRTC, { type IAgoraRTCClient, type IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { createBrowserClient } from "@/lib/supabase";

type ConnStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

const JOIN_TIMEOUT_MS = 8000;
const RETRY_INTERVAL_MS = 30_000;
const MAX_AUTO_RETRIES = 3;

/** User-facing copy only — never raw API or stack traces */
const COPY = {
  voiceConnected: "Voice connected",
  connecting: "Connecting voice…",
  voiceOff: "Voice off",
  temporarilyUnavailable: "Voice temporarily unavailable",
  signIn: "Sign in to use voice",
  micHint: "Allow microphone access to speak",
  envUnavailable: "Voice isn’t available in this environment.",
} as const;

type Props = {
  roomId: string;
  userId?: string;
  userName?: string;
  /** spectator = listen only (no microphone publish) */
  isSpectator?: boolean;
};

function ConnectingSpinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400"
      aria-hidden
    />
  );
}

export default function VoiceChat({ roomId, userId, userName, isSpectator = false }: Props) {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim() ?? "";
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteAudioUidsRef = useRef<Set<string | number>>(new Set());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const intentionalLeaveRef = useRef(false);
  const wasConnectedRef = useRef(false);

  const [conn, setConn] = useState<ConnStatus>("disconnected");
  /** Subtle hint below status (friendly only; failures log to console) */
  const [softHint, setSoftHint] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);

  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    console.info("[celo/voice] NEXT_PUBLIC_AGORA_APP_ID configured:", Boolean(appId), "length:", appId.length);
  }, [appId]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const leave = useCallback(async () => {
    intentionalLeaveRef.current = true;
    clearRetryTimer();
    const client = clientRef.current;
    clientRef.current = null;
    remoteAudioUidsRef.current.clear();
    localTrackRef.current?.close();
    localTrackRef.current = null;
    wasConnectedRef.current = false;
    if (client) {
      client.removeAllListeners();
      try {
        await client.unpublish();
      } catch {
        /* ignore */
      }
      try {
        await client.leave();
      } catch {
        /* ignore */
      }
    }
    setRemoteCount(0);
    setConn("disconnected");
    setSoftHint(null);
    console.info("[celo/voice] left channel");
  }, [clearRetryTimer]);

  const connectVoice = useCallback(async () => {
    if (!appId || !userId) {
      setSoftHint(!appId ? COPY.envUnavailable : COPY.signIn);
      setConn("disconnected");
      return;
    }
    intentionalLeaveRef.current = false;
    setSoftHint(null);
    setConn("connecting");

    const existing = clientRef.current;
    if (existing) {
      existing.removeAllListeners();
      try {
        await existing.unpublish();
      } catch {
        /* ignore */
      }
      try {
        await existing.leave();
      } catch {
        /* ignore */
      }
      clientRef.current = null;
    }
    localTrackRef.current?.close();
    localTrackRef.current = null;

    const sb = supabase;
    if (!sb) {
      console.error("[celo/voice] supabase client missing");
      setSoftHint(COPY.temporarilyUnavailable);
      setConn("disconnected");
      return;
    }

    const accessToken = (await sb.auth.getSession()).data.session?.access_token;
    if (!accessToken) {
      setSoftHint(COPY.signIn);
      setConn("disconnected");
      return;
    }

    let res: Response;
    try {
      res = await Promise.race([
        fetch("/api/agora/rtc-token", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ roomId, isSpectator }),
        }),
        new Promise<Response>((_, rej) =>
          setTimeout(() => rej(new Error("rtc-token timeout")), JOIN_TIMEOUT_MS)
        ),
      ]);
    } catch (e) {
      console.error("[celo/voice] token fetch failed", e);
      setSoftHint(COPY.temporarilyUnavailable);
      setConn("disconnected");
      return;
    }

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      channelName?: string;
      uid?: number;
      token?: string | null;
    };

    if (!res.ok) {
      console.error("[celo/voice] rtc-token failed", res.status, data);
      setSoftHint(COPY.temporarilyUnavailable);
      setConn("disconnected");
      return;
    }

    const channelName = data.channelName;
    const uid = data.uid;
    const token = data.token ?? null;

    console.info("[celo/voice] rtc-token ok", { channelName, uid, hasToken: Boolean(token), audience: isSpectator });

    if (!channelName || uid == null) {
      console.error("[celo/voice] missing channel or uid", data);
      setSoftHint(COPY.temporarilyUnavailable);
      setConn("disconnected");
      return;
    }

    AgoraRTC.setLogLevel(2);
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("connection-state-change", (cur, _prev, reason) => {
      console.info("[celo/voice] connection-state-change", cur, reason);
      if (cur === "CONNECTED") wasConnectedRef.current = true;
      if (cur === "DISCONNECTED" && wasConnectedRef.current && !intentionalLeaveRef.current) {
        if (retryCountRef.current < MAX_AUTO_RETRIES) {
          retryCountRef.current += 1;
          setConn("reconnecting");
          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            console.info("[celo/voice] auto-retry", retryCountRef.current);
            void connectVoice();
          }, RETRY_INTERVAL_MS);
        } else {
          setSoftHint(COPY.temporarilyUnavailable);
          setConn("disconnected");
        }
      }
    });

    client.on("user-published", async (user, mediaType) => {
      if (mediaType !== "audio") return;
      console.info("[celo/voice] user-published", user.uid);
      try {
        await client.subscribe(user, mediaType);
        user.audioTrack?.play();
        remoteAudioUidsRef.current.add(user.uid);
        setRemoteCount(remoteAudioUidsRef.current.size);
      } catch (e) {
        console.error("[celo/voice] subscribe error", e);
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType !== "audio") return;
      remoteAudioUidsRef.current.delete(user.uid);
      setRemoteCount(remoteAudioUidsRef.current.size);
    });

    try {
      await Promise.race([
        client.join(appId, channelName, token, uid),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("join timeout")), JOIN_TIMEOUT_MS)
        ),
      ]);
      console.info("[celo/voice] join ok");
    } catch (e) {
      console.error("[celo/voice] join failed", e);
      setSoftHint(COPY.temporarilyUnavailable);
      setConn("disconnected");
      await leave();
      return;
    }

    if (!isSpectator) {
      try {
        const mic = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = mic;
        await client.publish([mic]);
        console.info("[celo/voice] published mic");
      } catch (e) {
        console.error("[celo/voice] mic failed", e);
        setSoftHint(COPY.micHint);
        setConn("disconnected");
        await leave();
        return;
      }
    } else {
      console.info("[celo/voice] spectator — listen only");
    }

    retryCountRef.current = 0;
    setSoftHint(null);
    setConn("connected");
  }, [appId, userId, roomId, supabase, isSpectator, leave, clearRetryTimer]);

  const join = useCallback(() => {
    retryCountRef.current = 0;
    clearRetryTimer();
    void connectVoice();
  }, [connectVoice, clearRetryTimer]);

  useEffect(() => {
    return () => {
      void leave();
    };
  }, [leave]);

  const toggleMic = useCallback(async () => {
    if (isSpectator) return;
    const t = localTrackRef.current;
    if (!t) return;
    const next = !micOn;
    await t.setEnabled(next);
    setMicOn(next);
  }, [micOn, isSpectator]);

  const statusPresentation = useMemo(() => {
    if (conn === "connected") {
      return {
        emoji: "🟢",
        title: COPY.voiceConnected,
        color: "#10B981",
        showSpinner: false,
      };
    }
    if (conn === "connecting" || conn === "reconnecting") {
      return {
        emoji: "🟡",
        title: COPY.connecting,
        color: "#EAB308",
        showSpinner: true,
      };
    }
    return {
      emoji: "🔴",
      title: COPY.voiceOff,
      color: "#94A3B8",
      showSpinner: false,
    };
  }, [conn]);

  if (!appId) {
    return (
      <div
        className="rounded-xl border border-violet-500/25 p-4 text-[12px] leading-relaxed"
        style={{ background: "#0D0520", color: "#A855F7" }}
      >
        <p className="font-semibold text-violet-200/95">{COPY.envUnavailable}</p>
      </div>
    );
  }

  const showJoinOrRetry = conn === "disconnected";
  const needsRetryLabel = Boolean(softHint);

  return (
    <div className="rounded-xl border border-[rgba(124,58,237,0.25)] p-4 backdrop-blur-sm" style={{ background: "#0D0520" }}>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#A855F7" }}>
        Voice
      </p>
      <div className="flex items-center gap-2">
        {statusPresentation.showSpinner ? <ConnectingSpinner /> : null}
        <p className="text-base font-bold" style={{ color: statusPresentation.color }}>
          {statusPresentation.emoji} {statusPresentation.title}
        </p>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">
        {userName ?? userId ?? "You"}
        {isSpectator ? " · audience (listen only)" : " · microphone"}
        {remoteCount > 0 ? ` · ${remoteCount} in channel` : ""}
      </p>
      {isSpectator ? (
        <p className="mt-2 text-[11px] text-slate-500">Spectators can listen only.</p>
      ) : null}
      {softHint ? (
        <p className="mt-3 text-[12px] leading-snug text-slate-400">{softHint}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {showJoinOrRetry ? (
          <button
            type="button"
            onClick={join}
            className="rounded-lg px-4 py-2 text-[12px] font-bold text-[#0A0A0F]"
            style={{ background: "linear-gradient(135deg,#7C3AED,#A855F7)" }}
          >
            {needsRetryLabel ? "Retry voice" : "Join voice"}
          </button>
        ) : null}
        {conn === "connecting" || conn === "reconnecting" ? (
          <button
            type="button"
            onClick={() => void leave()}
            className="rounded-lg border border-white/15 px-3 py-2 text-[11px] text-slate-300"
          >
            Cancel
          </button>
        ) : null}
        {conn === "connected" ? (
          <>
            {!isSpectator && (
              <button
                type="button"
                onClick={() => void toggleMic()}
                className="rounded-lg border border-violet-500/50 px-3 py-2 text-[11px] text-violet-100"
              >
                {micOn ? "Mute" : "Unmute"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void leave()}
              className="rounded-lg border border-white/15 px-3 py-2 text-[11px] text-slate-300"
            >
              Leave voice
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
