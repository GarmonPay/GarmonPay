"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Optional group voice: set NEXT_PUBLIC_CELO_VOICE_DAILY_ROOM_URL to a Daily.co room URL
 * (create a room at https://dashboard.daily.co). Otherwise shows mic test only.
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
  const dailyRoomUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_CELO_VOICE_DAILY_ROOM_URL?.trim();
    if (!base) return null;
    try {
      const u = new URL(base);
      u.searchParams.set("t", roomId.slice(0, 12));
      return u.toString();
    } catch {
      return null;
    }
  }, [roomId]);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setLevel(0);
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  const tickMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
    const avg = data.length ? sum / data.length / 255 : 0;
    setLevel(avg);
    rafRef.current = requestAnimationFrame(tickMeter);
  }, []);

  const startMic = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      streamRef.current = s;
      setStream(s);

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      src.connect(analyser);
      analyserRef.current = analyser;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tickMeter);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Microphone unavailable";
      setError(msg);
      stopStream();
    }
  }, [stopStream, tickMeter]);

  useEffect(() => () => stopStream(), [stopStream]);

  const label =
    userName || userId || role ? ` · ${[userName, role].filter(Boolean).join(" · ")}` : "";

  return (
    <div className="rounded-xl border border-violet-500/25 bg-[#08051a]/90 p-3 backdrop-blur-sm">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-violet-400/70">Voice chat</p>
      <p className="mb-2 text-[11px] leading-snug text-violet-200/75">
        Room {roomId.slice(0, 8)}…{label}.
        {dailyRoomUrl
          ? " Use the voice room below so everyone can hear each other (Daily.co)."
          : " For live voice, your project admin can set NEXT_PUBLIC_CELO_VOICE_DAILY_ROOM_URL to a Daily.co room. Mic check below tests your device."}
      </p>

      {dailyRoomUrl && (
        <div className="mb-3 overflow-hidden rounded-lg border border-violet-500/30 bg-black/40">
          <iframe
            title="C-Lo voice"
            src={dailyRoomUrl}
            className="h-[200px] w-full"
            allow="camera; microphone; fullscreen; display-capture; autoplay"
          />
        </div>
      )}

      {error && <p className="mb-2 text-[11px] text-red-400/90">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!stream ? (
          <button
            type="button"
            onClick={() => void startMic()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md"
          >
            Test microphone
          </button>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Mic on
            </span>
            <div className="h-2 min-w-[72px] flex-1 overflow-hidden rounded-full bg-violet-950/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-lime-400 transition-[width] duration-75"
                style={{ width: `${Math.min(100, level * 140)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={stopStream}
              className="rounded-lg border border-violet-500/40 px-2.5 py-1 text-[11px] text-violet-200"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
