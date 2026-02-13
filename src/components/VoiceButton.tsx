/**
 * VoiceButton — microphone button that records speech, processes it through the
 * voice assistant parser, and applies attendance / edit actions.
 *
 * Uses the Web Speech API (SpeechRecognition) for on-device speech-to-text.
 */

import { useState, useRef, useCallback } from "react";
import { useStoreContext } from "@/context/StoreContext";
import {
  processVoiceTranscript,
  buildScheduledLessons,
  buildAllStudentList,
  type VoiceResult,
  type VoiceAction,
} from "@/utils/voiceAssistant";
import {
  getStudentsForDay,
  getLessonForStudentOnDate,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
} from "@/utils/earnings";

/* ------------------------------------------------------------------ */
/*  Web Speech API types (not in lib.dom for all TS configs)           */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string; confidence: number } }; length: number };
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type Phase = "idle" | "listening" | "processing" | "result" | "error";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VoiceButton({ dateKey, dayOfWeek, onDateChange }: { dateKey: string; dayOfWeek: number; onDateChange?: (date: Date) => void }) {
  const { data, addLesson, updateLesson } = useStoreContext();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const supported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /* ---- Apply actions to the store ---- */
  const applyActions = useCallback(
    async (actions: VoiceAction[], targetDate: string) => {
      const lines: string[] = [];
      for (const action of actions) {
        const student = data.students.find((s) => s.id === action.student_id);
        if (!student) continue;
        const name = `${student.firstName} ${student.lastName}`;
        const existing = getLessonForStudentOnDate(data.lessons, student.id, targetDate);

        if (action.type === "set_attendance") {
          if (existing) {
            await updateLesson(existing.id, { completed: action.present });
          } else {
            await addLesson({
              studentId: student.id,
              date: targetDate,
              durationMinutes: getEffectiveDurationMinutes(student, targetDate),
              amountCents: getEffectiveRateCents(student, targetDate),
              completed: action.present,
            });
          }
          lines.push(action.present ? `✓ ${name} — attended` : `✗ ${name} — absent`);
        }

        if (action.type === "set_duration") {
          if (existing) {
            await updateLesson(existing.id, { durationMinutes: action.duration_minutes });
          } else {
            await addLesson({
              studentId: student.id,
              date: targetDate,
              durationMinutes: action.duration_minutes,
              amountCents: getEffectiveRateCents(student, targetDate),
              completed: true,
            });
          }
          lines.push(`${name} — ${action.duration_minutes} min`);
        }

        if (action.type === "set_rate") {
          const rateCents = Math.round(action.rate * 100);
          if (existing) {
            await updateLesson(existing.id, { amountCents: rateCents });
          } else {
            await addLesson({
              studentId: student.id,
              date: targetDate,
              durationMinutes: getEffectiveDurationMinutes(student, targetDate),
              amountCents: rateCents,
              completed: true,
            });
          }
          lines.push(`${name} — $${action.rate}`);
        }
      }
      return lines;
    },
    [data, addLesson, updateLesson]
  );

  /* ---- Start listening ---- */
  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US"; // browser auto-detects, this is a hint
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    setPhase("listening");
    setTranscript("");
    setResult(null);
    setFeedback(null);
    setShowPanel(true);

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;
      setTranscript(text);
      setPhase("processing");

      // First pass: parse with current date to detect date navigation
      const allStudents = buildAllStudentList(data.students);
      let voiceResult = processVoiceTranscript(text, [], allStudents, dateKey);

      // If user navigated to a different date, re-resolve students for that date
      const targetDateKey = voiceResult.navigated_date ?? dateKey;
      const targetDate = new Date(targetDateKey + "T12:00:00");
      const targetDayOfWeek = targetDate.getDay();

      // Navigate the dashboard to the new date
      if (voiceResult.navigated_date && onDateChange) {
        onDateChange(targetDate);
      }

      // Re-run with the correct date's scheduled students
      const targetStudents = getStudentsForDay(data.students, targetDayOfWeek, targetDateKey);
      const scheduled = buildScheduledLessons(targetStudents, targetDateKey);
      voiceResult = processVoiceTranscript(text, scheduled, allStudents, dateKey);
      // Preserve navigated_date
      if (voiceResult.navigated_date && onDateChange) {
        // Already navigated above
      }
      setResult(voiceResult);

      const feedbackLines: string[] = [];

      // Show date navigation feedback
      if (voiceResult.navigated_date) {
        const navDate = new Date(voiceResult.navigated_date + "T12:00:00");
        const formatted = navDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        feedbackLines.push(`Navigated to ${formatted}`);
      }

      if (voiceResult.intent === "clarify" && voiceResult.actions.length === 0) {
        if (voiceResult.navigated_date && voiceResult.unmatched_mentions.length === 0) {
          // Just a date navigation, no attendance
          setFeedback(feedbackLines.join("\n") || "Done!");
        } else {
          setFeedback(voiceResult.clarifying_question);
        }
        setPhase("result");
      } else {
        // Apply actions
        const actionDate = voiceResult.navigated_date ?? (voiceResult.actions[0]?.date ?? dateKey);
        const lines = await applyActions(voiceResult.actions, actionDate);
        feedbackLines.push(...lines);
        setFeedback(feedbackLines.join("\n") || "Done!");
        setPhase("result");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") {
        setFeedback("No speech detected. Tap the mic and try again.");
      } else if (event.error === "not-allowed") {
        setFeedback("Microphone access denied. Please allow microphone in your browser settings.");
      } else if (event.error === "network") {
        setFeedback("Voice recognition needs an internet connection. Please check your Wi-Fi or cellular data and try again.");
      } else if (event.error === "audio-capture") {
        setFeedback("No microphone found. Please connect a microphone and try again.");
      } else if (event.error === "aborted") {
        setFeedback("Voice input was cancelled.");
      } else {
        setFeedback(`Something went wrong (${event.error}). Please try again.`);
      }
      setPhase("error");
    };

    recognition.onend = () => {
      if (phase === "listening") {
        // If ended without result, this is usually "no-speech"
        // The onerror handler should have already fired
      }
    };

    recognition.start();
  }, [data, dateKey, dayOfWeek, applyActions, phase]);

  /* ---- Stop listening ---- */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setPhase("idle");
  }, []);

  /* ---- Close panel ---- */
  const closePanel = useCallback(() => {
    setShowPanel(false);
    setPhase("idle");
    setTranscript("");
    setResult(null);
    setFeedback(null);
  }, []);

  if (!supported) return null;

  const isListening = phase === "listening";

  return (
    <>
      {/* Floating mic button */}
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        aria-label={isListening ? "Stop listening" : "Voice input"}
        style={{
          position: "fixed",
          bottom: 88,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: isListening ? "#dc2626" : "var(--primary, #c97b94)",
          color: "#fff",
          border: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 900,
          transition: "background 0.2s, transform 0.15s",
          transform: isListening ? "scale(1.1)" : "scale(1)",
        }}
      >
        {isListening ? (
          /* Stop icon (square) */
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          /* Mic icon */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Feedback panel (slides up from bottom) */}
      {showPanel && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--card, #fff)",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
            padding: "20px 24px 28px",
            zIndex: 1000,
            maxHeight: "50vh",
            overflowY: "auto",
            fontFamily: "var(--font-sans)",
          }}
        >
          {/* Close button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {phase === "listening" ? "Listening..." : phase === "processing" ? "Processing..." : "Voice Input"}
            </span>
            <button
              type="button"
              onClick={closePanel}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)", padding: "4px 8px" }}
            >
              &times;
            </button>
          </div>

          {/* Listening indicator */}
          {phase === "listening" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%",
                background: "#dc2626",
                animation: "voicePulse 1.2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 15, color: "var(--text-muted)" }}>Say something like "Emily came today"</span>
              <style>{`@keyframes voicePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }`}</style>
            </div>
          )}

          {/* Processing */}
          {phase === "processing" && (
            <div style={{ padding: "12px 0", color: "var(--text-muted)", fontSize: 14 }}>
              {transcript && <p style={{ margin: "0 0 8px", fontStyle: "italic" }}>"{transcript}"</p>}
              <span>Processing...</span>
            </div>
          )}

          {/* Results */}
          {(phase === "result" || phase === "error") && (
            <div style={{ padding: "4px 0" }}>
              {transcript && (
                <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)", fontStyle: "italic" }}>
                  "{transcript}"
                </p>
              )}
              {feedback && (
                <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                  {feedback}
                </div>
              )}
              {result && result.unmatched_mentions.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
                  {result.unmatched_mentions.map((u, i) => (
                    <div key={i}>
                      {u.reason === "not_found" && `Could not find "${u.spoken_name}" in your students.`}
                      {u.reason === "ambiguous" && `"${u.spoken_name}" matches multiple students.`}
                      {u.reason === "not_scheduled_today" && `"${u.spoken_name}" is not scheduled today.`}
                    </div>
                  ))}
                </div>
              )}
              {/* Try again / close buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => { closePanel(); setTimeout(startListening, 100); }}
                  className="pill"
                  style={{ padding: "10px 18px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)" }}
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="pill pill--active"
                  style={{ padding: "10px 18px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
