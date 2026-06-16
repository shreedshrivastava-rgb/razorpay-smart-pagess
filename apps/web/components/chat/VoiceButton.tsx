"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

// Minimal interface — SpeechRecognition is absent from older TS DOM typings
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  _finalText?: string;
  start(): void;
  stop(): void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: { error: string } & Event) => void) | null;
  onresult: ((ev: {
    results: { isFinal: boolean; [i: number]: { transcript: string } }[];
  } & Event) => void) | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SR: (new () => ISpeechRecognition) | undefined =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : undefined;

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // ─── MediaRecorder fallback (ElevenLabs) ────────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupported(!!SR || !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // ─── Web Speech API path (primary) ──────────────────────────────────────────

  function startSpeechRecognition(): boolean {
    if (!SR) return false;

    const recognition = new SR();
    recognition.continuous = true;      // keep listening until user taps stop
    recognition.interimResults = true;  // show live transcript as they speak
    recognition.lang = "en-IN";

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + " ";
        }
      }
      if (finalText.trim()) recognition._finalText = finalText.trim();
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        console.error("SpeechRecognition error:", event.error);
      }
    };

    recognition.onend = () => {
      const text = recognition._finalText ?? "";
      if (text) onTranscriptRef.current(text);
      setListening(false);
      setProcessing(false);
      recognitionRef.current = null;
    };

    recognition.start();
    recognitionRef.current = recognition;
    return true;
  }

  function stopSpeechRecognition() {
    recognitionRef.current?.stop();
  }

  // ─── MediaRecorder + ElevenLabs path (fallback) ──────────────────────────────

  async function startMediaRecorder() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      if (blob.size < 500) { setProcessing(false); return; }

      try {
        const fd = new FormData();
        fd.append("audio", blob, `rec.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
        const res = await fetch("/api/stt", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.text();
          console.error("STT failed:", res.status, body);
          return;
        }
        const { text } = await res.json() as { text: string };
        if (text?.trim()) onTranscriptRef.current(text.trim());
      } catch (err) {
        console.error("STT error:", err);
      } finally {
        setProcessing(false);
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setListening(true);
  }

  function stopMediaRecorder() {
    if (mediaRecorderRef.current?.state === "recording") {
      setListening(false);
      setProcessing(true);
      mediaRecorderRef.current.stop();
    }
  }

  // ─── Unified toggle ──────────────────────────────────────────────────────────

  function toggle() {
    if (listening) {
      // Stop whichever path is active
      if (recognitionRef.current) stopSpeechRecognition();
      else stopMediaRecorder();
      return;
    }

    // Try Web Speech API first; fall back to MediaRecorder+ElevenLabs
    const usedSR = startSpeechRecognition();
    if (!usedSR) void startMediaRecorder().catch((err) => {
      console.error("Mic access error:", err);
      setListening(false);
    });
  }

  if (!supported) return null;

  const isDisabled = disabled || processing;
  const label = processing ? "Transcribing…" : listening ? "Stop recording" : "Speak your message";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className={[
        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
        "transition-colors transition-transform duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        listening
          ? "bg-red-500 text-white shadow-lg shadow-red-200 scale-110 animate-pulse"
          : processing
          ? "bg-indigo-100 text-indigo-400"
          : "bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600",
      ].join(" ")}
      style={{ touchAction: "manipulation" }}
    >
      {processing ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : listening ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}
