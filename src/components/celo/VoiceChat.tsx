"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgoraRTC, { type IAgoraRTCClient, type IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import { createBrowserClient } from "@/lib/supabase";

type VoiceStatus = "idle" | "connecting" | "connected" | "error";

const CONNECT_TIMEOUT_MS = 8000;

/**
 * Agora RTC voice for C-Lo rooms (audio only).
 *
 * - NEXT_PUBLIC_AGORA_APP_ID — required on client
 * - AGORA_APP_CERTIFICATE — server; omit for dev / testing (token null)
 */
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
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim() ?? "";
  const label =
    userName || userId || role ? ` · ${[userName, role].filter(Boolean).join(" · ")}` : "";

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteAudioUidsRef = useRef<Set<string | number>>(new Set());

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [remoteCount, setRemoteCount] = useState(0);

  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    console.info("[celo/voice] NEXT_PUBLIC_AGORA_APP_ID configured:", Boolean(appId), "length:", appId.length);
  }, [appId]);

  const leave = useCallback(async () => {
    const client = clientRef.current;
    clientRef.current = null;
    remoteAudioUidsRef.current.clear();
    localTrackRef.current?.close();
    localTrackRef.current = null;
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
    setStatus("idle");
    console.info("[celo/voice] leave complete");
  }, []);

  const join = useCallback(async () => {
    if (!appId || !userId) {
      setError("Sign in and set NEXT_PUBLIC_AGORA_APP_ID.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("connecting");
    remoteAudioUidsRef.current.clear();

    const sb = supabase;
    if (!sb) {
      setError("Client not configured.");
      setStatus("error");
      return;
    }

    const accessToken = (await sb.auth.getSession()).data.session?.access_token;
    if (!accessToken) {
      setError("Not signed in.");
      setStatus("error");
      return;
    }

    let res: Response;
    try {
      const fetchPromise = fetch("/api/agora/rtc-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ roomId }),
      });
      res = await Promise.race([
        fetchPromise,
        new Promise<Response>((_, rej) =>
          setTimeout(() => rej(new Error("rtc-token request timed out")), CONNECT_TIMEOUT_MS)
        ),
      ]);
    } catch (e) {
      console.error("[celo/voice] rtc-token fetch error", e);
      setError(e instanceof Error ? e.message : "Token request failed");
      setStatus("error");
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
      setError(data.error ?? `Token error (${res.status})`);
      setStatus("error");
      return;
    }

    const channelName = data.channelName;
    const uid = data.uid;
    const token = data.token ?? null;
    console.info("[celo/voice] rtc-token ok", {
      channelName,
      uid,
      tokenMode: token ? "token" : "null (dev / no AGORA_APP_CERTIFICATE)",
    });

    if (!channelName || uid == null) {
      setError("Invalid token response.");
      setStatus("error");
      return;
    }

    AgoraRTC.setLogLevel(2);

    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    client.on("connection-state-change", (cur, prev, reason) => {
      console.info("[celo/voice] connection-state-change", { cur, prev, reason });
    });
    client.on("exception", (ex) => {
      console.error("[celo/voice] Agora exception", ex);
    });
    client.on("user-joined", (user) => {
      console.info("[celo/voice] user-joined", user.uid);
    });
    client.on("user-left", (user) => {
      console.info("[celo/voice] user-left", user.uid);
    });

    client.on("user-published", async (user, mediaType) => {
      if (mediaType !== "audio") return;
      try {
        console.info("[celo/voice] user-published", user.uid, mediaType);
        await client.subscribe(user, mediaType);
        const track = user.audioTrack;
        if (track) {
          track.play();
          console.info("[celo/voice] subscribed + audioTrack.play() uid=", user.uid);
        } else {
          console.warn("[celo/voice] subscribed but no audioTrack uid=", user.uid);
        }
        remoteAudioUidsRef.current.add(user.uid);
        setRemoteCount(remoteAudioUidsRef.current.size);
      } catch (e) {
        console.error("[celo/voice] subscribe failed", e);
      }
    });

    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType !== "audio") return;
      console.info("[celo/voice] user-unpublished", user.uid);
      remoteAudioUidsRef.current.delete(user.uid);
      setRemoteCount(remoteAudioUidsRef.current.size);
    });

    try {
      await Promise.race([
        client.join(appId, channelName, token, uid),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`Agora join timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS)
        ),
      ]);
      console.info("[celo/voice] join ok channel=", channelName, "uid=", uid);
    } catch (e) {
      console.error("[celo/voice] join failed", e);
      setError(e instanceof Error ? e.message : "Join failed");
      setStatus("error");
      await leave();
      return;
    }

    try {
      const mic = await AgoraRTC.createMicrophoneAudioTrack();
      localTrackRef.current = mic;
      await client.publish([mic]);
      console.info("[celo/voice] publish mic ok");
    } catch (e) {
      console.error("[celo/voice] microphone / publish failed", e);
      setError(e instanceof Error ? e.message : "Microphone failed");
      setStatus("error");
      await leave();
      return;
    }

    setStatus("connected");
  }, [appId, userId, roomId, leave, supabase]);

  useEffect(() => {
    return () => {
      void leave();
    };
  }, [leave]);

  const toggleMic = useCallback(async () => {
    const t = localTrackRef.current;
    if (!t) return;
    const next = !micOn;
    await t.setEnabled(next);
    setMicOn(next);
    console.info("[celo/voice] mic", next ? "on" : "off");
  }, [micOn]);

  if (!appId) {
    return (
      <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-3 backdrop-blur-sm">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-violet-400/70">Voice chat</p>
        <p className="text-[11px] text-violet-200/75">
          Set <code className="text-violet-300">NEXT_PUBLIC_AGORA_APP_ID</code> in env. Optional:{" "}
          <code className="text-violet-300">AGORA_APP_CERTIFICATE</code> on the server for token mode.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-3 backdrop-blur-sm">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-violet-400/70">Voice chat (Agora)</p>
      <p className="mb-2 text-[11px] leading-snug text-violet-200/75">
        Room {roomId.slice(0, 8)}…{label}. Remote audio streams: {remoteCount}
      </p>

      {error && <p className="mb-2 text-[11px] text-red-400/90">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {status === "idle" || status === "error" ? (
          <button
            type="button"
            onClick={() => void join()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md"
          >
            Connect voice
          </button>
        ) : status === "connecting" ? (
          <span className="text-[11px] text-violet-300">Connecting… (max {CONNECT_TIMEOUT_MS / 1000}s)</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void toggleMic()}
              className="rounded-lg border border-violet-500/50 px-3 py-1.5 text-[11px] font-semibold text-violet-100"
            >
              {micOn ? "Mute mic" : "Unmute mic"}
            </button>
            <button
              type="button"
              onClick={() => void leave()}
              className="rounded-lg border border-red-500/40 px-2.5 py-1 text-[11px] text-red-300"
            >
              Leave
            </button>
          </>
        )}
      </div>
    </div>
  );
}
