"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgoraRTC, { type IAgoraRTCClient, type IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { createBrowserClient } from "@/lib/supabase";

type ConnStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

const JOIN_TIMEOUT_MS = 8000;
const RETRY_INTERVAL_MS = 30_000;
const MAX_AUTO_RETRIES = 3;

type Props = {
  roomId: string;
  userId?: string;
  userName?: string;
  /** spectator = listen only (no microphone publish) */
  isSpectator?: boolean;
};

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
  const [error, setError] = useState<string | null>(null);
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
    console.info("[celo/voice] left channel");
  }, [clearRetryTimer]);

  const connectVoice = useCallback(async () => {
    if (!appId || !userId) {
      setError("Sign in and set NEXT_PUBLIC_AGORA_APP_ID.");
      setConn("disconnected");
      return;
    }
    intentionalLeaveRef.current = false;
    setError(null);
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
      setError("Client not configured.");
      setConn("disconnected");
      return;
    }

    const accessToken = (await sb.auth.getSession()).data.session?.access_token;
    if (!accessToken) {
      setError("Not signed in.");
      setConn("disconnected");
      return;
    }

    let res: Response;
    try {
      res = await Promise.race([
        fetch("/api/agora/rtc-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ roomId }),
        }),
        new Promise<Response>((_, rej) =>
          setTimeout(() => rej(new Error("rtc-token timeout")), JOIN_TIMEOUT_MS)
        ),
      ]);
    } catch (e) {
      console.error("[celo/voice] token fetch failed", e);
      setError("Voice unavailable. Try again.");
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
      setError(data.error ?? "Voice unavailable. Try again.");
      setConn("disconnected");
      return;
    }

    const channelName = data.channelName;
    const uid = data.uid;
    const token = data.token ?? null;

    console.info("[celo/voice] rtc-token ok", { channelName, uid, hasToken: Boolean(token), audience: isSpectator });

    if (!channelName || uid == null) {
      setError("Voice unavailable. Try again.");
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
          setError("Voice disconnected. Try again.");
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
      setError("Voice unavailable. Try again.");
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
        setError("Microphone unavailable.");
        setConn("disconnected");
        await leave();
        return;
      }
    } else {
      console.info("[celo/voice] spectator — listen only");
    }

    retryCountRef.current = 0;
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

  const statusLine = useMemo(() => {
    if (conn === "connected") return "🟢 Connected";
    if (conn === "connecting") return "🟡 Connecting…";
    if (conn === "reconnecting") return "🟡 Reconnecting…";
    return "🔴 Disconnected — Retry";
  }, [conn]);

  if (!appId) {
    return (
      <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-3 text-[11px] text-violet-200/80">
        Set <code className="text-violet-300">NEXT_PUBLIC_AGORA_APP_ID</code> for voice.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-3 backdrop-blur-sm">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-violet-400/70">Voice</p>
      <p className="text-[11px] text-slate-300">{statusLine}</p>
      <p className="mt-1 text-[10px] text-slate-500">
        {userName ?? userId ?? "You"} {isSpectator ? "· audience (listen only)" : "· mic"}
        {remoteCount > 0 ? ` · ${remoteCount} remote` : ""}
      </p>
      {error && <p className="mt-2 text-[11px] text-red-400/90">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {conn === "disconnected" || conn === "reconnecting" ? (
          <button
            type="button"
            onClick={join}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[11px] font-semibold text-white"
          >
            {error ? "Retry voice" : "Connect voice"}
          </button>
        ) : (
          <>
            {!isSpectator && (
              <button
                type="button"
                onClick={() => void toggleMic()}
                className="rounded-lg border border-violet-500/50 px-3 py-1.5 text-[11px] text-violet-100"
              >
                {micOn ? "Mute" : "Unmute"}
              </button>
            )}
            <button type="button" onClick={() => void leave()} className="rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-300">
              Leave
            </button>
          </>
        )}
      </div>
    </div>
  );
}
