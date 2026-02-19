/**
 * useVoiceInput — record, transcribe, detect language, normalize transcript for Insights.
 * Handles EN/ES/ZH; normalizes filler words, numbers (e.g. "one hundred K"), relative dates.
 */

import { useState, useRef, useCallback } from "react";

export type VoicePhase = "idle" | "recording" | "processing";

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function langToLocale(lang: "en" | "es" | "zh"): string {
  if (lang === "es") return "es-ES";
  if (lang === "zh") return "zh-CN";
  return "en-US";
}

/** Detect language from transcript for speech locale and response language. */
export function detectLanguageFromTranscript(text: string): "en" | "es" | "zh" {
  const t = text.trim();
  if (!t) return "en";
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(t)) return "zh";
  if (/\b(cuánto|cuantas|gané|ganar|este\s+mes|tarifa|promedio|impuesto|qué|cuál|cuántos)\b/i.test(t)) return "es";
  return "en";
}

/**
 * Normalize transcript: remove filler words, normalize spoken numbers and dates.
 * Produces a clean query string for the Insights engine.
 */
export function normalizeTranscript(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  // Filler / lead-in phrases (EN/ES/ZH)
  s = s
    .replace(/\b(um|uh|like|hey|so|well|can you tell me|could you tell me|I want to know|I'd like to know)\b/gi, " ")
    .replace(/\b(pues|entonces|oye|dime|quiero saber|me gustaría saber)\b/gi, " ")
    .replace(/\s*(那个|就是|嗯|呃)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Spoken numbers (English): "one hundred K" / "a hundred thousand" → 100000
  const hundredK = /\b(one\s+)?hundred\s*(?:thousand|k)\b/i;
  if (hundredK.test(s)) {
    s = s.replace(hundredK, "100000");
  }
  const eightyK = /\b(?:eighty|80)\s*(?:thousand|k)\b/i;
  if (eightyK.test(s)) {
    s = s.replace(eightyK, "80000");
  }
  s = s.replace(/\b(\d+)\s*k\b/gi, (_, n) => `${parseInt(n, 10) * 1000}`);
  s = s.replace(/\b(\d+)\s*thousand\b/gi, (_, n) => `${parseInt(n, 10) * 1000}`);

  // Spanish: "cien mil" → 100000
  s = s.replace(/\bcien\s*mil\b/i, "100000");
  s = s.replace(/\b(\d+)\s*mil\b/gi, (_, n) => `${parseInt(n, 10) * 1000}`);

  // Chinese: "十万" → 100000, "八万" → 80000
  s = s.replace(/十万/g, "100000");
  s = s.replace(/八万/g, "80000");
  s = s.replace(/(\d+)万/g, (_, n) => `${parseInt(n, 10) * 10000}`);

  // Relative dates: keep as-is for engine (this month, last month, etc. are parsed in compute)
  return s.replace(/\s+/g, " ").trim();
}

export type UseVoiceInputArgs = {
  /** Preferred locale hint (from app language). */
  preferredLang?: "en" | "es" | "zh";
  /** Called when transcription is ready; receives normalized query. Auto-run if true. */
  onTranscript?: (text: string, language: "en" | "es" | "zh") => void;
};

export function useVoiceInput({ preferredLang = "en", onTranscript }: UseVoiceInputArgs = {}) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [detectedLang, setDetectedLang] = useState<"en" | "es" | "zh">("en");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const supported = typeof window !== "undefined" && !!getSpeechRecognition();

  const startRecording = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setError("Voice not supported in this browser.");
      return;
    }
    setError(null);
    setTranscript("");
    const rec = new SR();
    rec.lang = langToLocale(preferredLang);
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: unknown) => {
      const ev = e as { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } };
      const results = ev.results;
      const len = results.length;
      const last = len > 0 ? results[len - 1] : null;
      const text = last?.[0]?.transcript ?? "";
      if (text) {
        setPhase("processing");
        const lang = detectLanguageFromTranscript(text);
        setDetectedLang(lang);
        const normalized = normalizeTranscript(text);
        setTranscript(normalized);
        onTranscript?.(normalized, lang);
      }
      setPhase("idle");
    };

    rec.onerror = (e: unknown) => {
      const err = (e as { error: string }).error;
      if (err === "no-speech") {
        setError("No speech detected. Try again.");
      } else if (err === "not-allowed") {
        setError("Microphone access denied. Allow the mic in your browser settings.");
      } else if (err === "network") {
        setError("Voice needs an internet connection.");
      } else {
        setError(`Voice error: ${err}`);
      }
      setPhase("idle");
    };

    rec.onend = () => {
      setPhase((p) => (p === "recording" ? "idle" : p));
    };

    recognitionRef.current = rec;
    setPhase("recording");
    rec.start();
  }, [preferredLang, onTranscript]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setPhase("idle");
  }, []);

  return {
    phase,
    transcript,
    detectedLang,
    error,
    supported,
    startRecording,
    stopRecording,
    clearError: useCallback(() => setError(null), []),
  };
}
