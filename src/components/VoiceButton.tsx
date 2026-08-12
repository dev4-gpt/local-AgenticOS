"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface Props {
  onTranscript: (text: string, opts: { final: boolean }) => void;
  className?: string;
  size?: number;
  disabled?: boolean;
}

function recordingMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const value of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    try { if (MediaRecorder.isTypeSupported(value)) return value; } catch { /* browser-specific */ }
  }
  return "";
}

function extensionFor(type: string) {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

/** Shared native microphone control. Audio is transcribed server-side by Groq. */
export default function VoiceButton({ onTranscript, className = "", size = 36, disabled = false }: Props) {
  const [active, setActive] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const supportedInBrowser = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
    const supportTimer = window.setTimeout(() => setSupported(supportedInBrowser), 0);
    return () => {
      window.clearTimeout(supportTimer);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      try { recorderRef.current?.stop(); } catch { /* already stopped */ }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function transcribe(blob: Blob, type: string) {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, `recording.${extensionFor(type)}`);
      const response = await fetch("/api/speech/transcribe", { method: "POST", body: form });
      const body = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `speech_http_${response.status}`);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) throw new Error("no_speech_detected");
      onTranscript(text, { final: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "speech transcription failed");
    } finally {
      setTranscribing(false);
    }
  }

  async function start() {
    if (disabled) return;
    setError(null);
    if (!supported) { setError("Microphone recording is not supported in this browser"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = recordingMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (blob.size < 1400) { setError("Recording was too short"); return; }
        void transcribe(blob, type);
      };
      recorder.start();
      setActive(true);
      timerRef.current = window.setTimeout(stop, 30_000);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Microphone blocked — allow it in the address bar" : "Could not start microphone");
    }
  }

  function stop() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setActive(false);
    try { if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop(); } catch { /* */ }
  }

  if (supported === false) {
    return <button title="Microphone recording is not supported" disabled className={`grid place-items-center rounded-lg border border-[var(--panel-border)] text-[var(--fg-dimmer)] opacity-50 cursor-not-allowed ${className}`} style={{ width: size, height: size }}><MicOff size={size * 0.45} /></button>;
  }

  const busy = active || transcribing;
  return (
    <>
      <motion.button type="button" onClick={busy ? stop : start} whileTap={{ scale: 0.92 }} disabled={disabled || transcribing}
        title={transcribing ? "Transcribing…" : active ? "Stop recording" : "Record voice input"}
        className={`relative grid place-items-center rounded-lg border transition ${className}`}
        style={{ width: size, height: size, borderColor: active ? "rgba(248,113,113,0.6)" : "var(--panel-border)", background: active ? "rgba(248,113,113,0.12)" : "transparent", color: active ? "#f87171" : "var(--fg-dim)" }}>
        {transcribing ? <Loader2 size={size * 0.45} className="animate-spin" /> : active ? <MicOff size={size * 0.45} /> : <Mic size={size * 0.45} />}
        {active && <span className="absolute inset-0 rounded-lg pointer-events-none" style={{ animation: "mic-ring 1.4s ease-out infinite" }} />}
        <style jsx>{`@keyframes mic-ring { 0% { box-shadow: 0 0 0 0 rgba(248,113,113,0.45); } 70% { box-shadow: 0 0 0 12px rgba(248,113,113,0); } 100% { box-shadow: 0 0 0 0 rgba(248,113,113,0); } }`}</style>
      </motion.button>
      {error && <span className="text-[10px] text-rose-300 ml-2">{error}</span>}
    </>
  );
}
