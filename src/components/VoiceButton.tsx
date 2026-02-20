/**
 * VoiceButton — dashboard voice command entry.
 * Uses strict command pipeline: parse -> validate -> execute -> verify.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button, IconButton } from "@/components/ui/Button";
import {
  getStudentsForDay,
  getLessonForStudentOnDate,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
} from "@/utils/earnings";
import { hasSupabase } from "@/lib/supabase";
import { fetchLessons } from "@/store/supabaseSync";
import {
  handleVoiceCommand,
  resumePendingVoiceCommand,
  type DashboardContext,
  type DashboardScheduledLesson,
  type PendingVoiceCommand,
  type VoiceDebug,
} from "@/lib/voice/homeVoicePipeline";
import type { Lesson } from "@/types";

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

function langToSpeechLocale(lang: string): string {
  if (lang === "es") return "es-ES";
  if (lang === "zh") return "zh-CN";
  return "en-US";
}

function applyClarificationOption(transcript: string, option: string): string {
  const dateMatch = option.match(/\((\d{4}-\d{2}-\d{2})\)/);
  const dateKey = dateMatch?.[1];
  if (!dateKey) return transcript;
  const weekdayMatch = option.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (!weekdayMatch) return `${transcript} ${dateKey}`;
  const weekday = weekdayMatch[1];
  const re = new RegExp(`\\b${weekday}\\b`, "i");
  if (re.test(transcript)) return transcript.replace(re, dateKey);
  return `${transcript} ${dateKey}`;
}

export default function VoiceButton({
  dateKey,
  dayOfWeek: _dayOfWeek,
  onDateChange,
}: {
  dateKey: string;
  dayOfWeek: number;
  onDateChange?: (date: Date) => void;
}) {
  const { data, updateLesson, addLesson } = useStoreContext();
  const { lang } = useLanguage();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [clarificationOptions, setClarificationOptions] = useState<string[]>([]);
  const [pendingCommand, setPendingCommand] = useState<PendingVoiceCommand | null>(null);
  const [appliedClarification, setAppliedClarification] = useState<string | null>(null);
  const [unmatchedItems, setUnmatchedItems] = useState<{ text: string; reason: string }[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [debugPayload, setDebugPayload] = useState<VoiceDebug | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const dataRef = useRef(data);
  const queryAllowsDebug =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).get("voiceDebug") === "1" ||
      new URLSearchParams(window.location.search).get("debug") === "1");
  const envAllowsDebug = import.meta.env.VITE_VOICE_DEBUG === "1";
  const canUseDebug = import.meta.env.DEV || queryAllowsDebug || envAllowsDebug;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const getScheduledLessonsForDate = useCallback(
    (targetDateKey: string): DashboardScheduledLesson[] => {
      const targetDate = new Date(`${targetDateKey}T12:00:00`);
      const dow = targetDate.getDay();
      const students = getStudentsForDay(dataRef.current.students, dow, targetDateKey);
      return students
        .map((s) => {
          const lesson = getLessonForStudentOnDate(dataRef.current.lessons, s.id, targetDateKey);
          return {
            lesson_id: lesson?.id ?? null,
            student_id: s.id,
            student_name: `${s.firstName} ${s.lastName}`,
            date: targetDateKey,
            time: lesson?.timeOfDay ?? s.timeOfDay ?? "",
            duration_minutes: lesson?.durationMinutes ?? getEffectiveDurationMinutes(s, targetDateKey),
            amount_cents: lesson?.amountCents ?? getEffectiveRateCents(s, targetDateKey),
            completed: lesson?.completed ?? false,
          } satisfies DashboardScheduledLesson;
        })
        .filter((x): x is DashboardScheduledLesson => x != null);
    },
    []
  );

  const runVoiceCommand = useCallback(async (text: string) => {
    setTranscript(text);
    setPhase("processing");
    try {
      const dashboardContext: DashboardContext = {
        user_id: dataRef.current.user?.id ?? "local-user",
        selected_date: dateKey,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        scheduled_lessons: getScheduledLessonsForDate(dateKey),
      };

      const result = await handleVoiceCommand(text, dashboardContext, {
        students: dataRef.current.students,
        lessons: dataRef.current.lessons,
        getScheduledLessonsForDate,
        updateLessonById: (lessonId, updates) => updateLesson(lessonId, updates),
        addLesson: (lesson) => addLesson(lesson),
        fetchLessonsForVerification: async (): Promise<Lesson[]> => {
          if (hasSupabase() && dataRef.current.user?.id) {
            return fetchLessons(dataRef.current.user.id);
          }
          await new Promise((r) => setTimeout(r, 0));
          return dataRef.current.lessons;
        },
      }, {
        debug: import.meta.env.DEV || (canUseDebug && debugMode),
        dryRun: canUseDebug && dryRunMode,
      });

      if (result.plan?.target_date && result.plan.target_date !== dateKey && onDateChange) {
        onDateChange(new Date(`${result.plan.target_date}T12:00:00`));
      }

      setFeedback(result.human_message);
      setClarificationOptions(result.clarification_options ?? []);
      setPendingCommand(result.pending_command ?? null);
      setUnmatchedItems([]);
      setDebugPayload(result.debug ?? null);
      setPhase("result");
    } catch (_err) {
      setFeedback("I couldn't process that command safely. Please try again.");
      setClarificationOptions([]);
      setPendingCommand(null);
      setUnmatchedItems([]);
      setDebugPayload(null);
      setPhase("error");
    }
  }, [dateKey, onDateChange, updateLesson, addLesson, getScheduledLessonsForDate, canUseDebug, debugMode, dryRunMode]);

  /* ---- Start listening ---- */
  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = langToSpeechLocale(lang);
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    setPhase("listening");
    setTranscript("");
    setFeedback(null);
    setClarificationOptions([]);
    setPendingCommand(null);
    setAppliedClarification(null);
    setUnmatchedItems([]);
    setDebugPayload(null);
    setShowPanel(true);

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;
      await runVoiceCommand(text);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") {
        setFeedback("No speech detected. Tap the mic and try again.");
      } else if (event.error === "not-allowed") {
        setFeedback(
          "Microphone access denied. Please allow microphone in your browser settings."
        );
      } else if (event.error === "network") {
        setFeedback(
          "Voice recognition needs an internet connection. Please check your Wi-Fi or cellular data and try again."
        );
      } else if (event.error === "audio-capture") {
        setFeedback(
          "No microphone found. Please connect a microphone and try again."
        );
      } else if (event.error === "aborted") {
        setFeedback("Voice input was cancelled.");
      } else {
        setFeedback(`Something went wrong (${event.error}). Please try again.`);
      }
      setPhase("error");
    };

    recognition.onend = () => {
      // If ended without result, onerror should have already fired
    };

    recognition.start();
  }, [lang, runVoiceCommand]);

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
    setFeedback(null);
    setClarificationOptions([]);
    setPendingCommand(null);
    setAppliedClarification(null);
    setUnmatchedItems([]);
    setDebugPayload(null);
  }, []);

  if (!supported) return null;

  const isListening = phase === "listening";

  return (
    <>
      {/* Floating mic button */}
      <IconButton
        type="button"
        onClick={isListening ? stopListening : startListening}
        aria-label={isListening ? "Stop listening" : "Voice input"}
        variant={isListening ? "danger" : "primary"}
        size="lg"
        style={{
          position: "fixed",
          bottom: 88,
          right: 20,
          color: "#fff",
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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </IconButton>

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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {phase === "listening"
                ? "Listening..."
                : phase === "processing"
                  ? "Processing..."
                  : "Voice Input"}
            </span>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={closePanel}
              aria-label="Close"
            >
              &times;
            </IconButton>
          </div>
          {canUseDebug && (
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 12,
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                Debug
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={dryRunMode}
                  onChange={(e) => setDryRunMode(e.target.checked)}
                />
                Dry run
              </label>
            </div>
          )}

          {/* Listening indicator */}
          {phase === "listening" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "16px 0",
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "var(--avatar-gradient)",
                  animation: "voicePulse 1.2s ease-in-out infinite",
                }}
              />
              <span style={{ fontSize: 15, color: "var(--text-muted)" }}>
                Say something like &quot;Emily came today&quot;
              </span>
              <style>{`@keyframes voicePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }`}</style>
            </div>
          )}

          {/* Processing */}
          {phase === "processing" && (
            <div
              style={{
                padding: "12px 0",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              {transcript && (
                <p style={{ margin: "0 0 8px", fontStyle: "italic" }}>
                  &quot;{transcript}&quot;
                </p>
              )}
              <span>Processing...</span>
            </div>
          )}

          {/* Results */}
          {(phase === "result" || phase === "error") && (
            <div style={{ padding: "4px 0" }}>
              {transcript && (
                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: 14,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  &quot;{transcript}&quot;
                </p>
              )}
              {appliedClarification && (
                <div
                  style={{
                    margin: "0 0 12px",
                    display: "inline-block",
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 999,
                    background: "rgba(233, 226, 255, 0.9)",
                    color: "var(--text)",
                    border: "1px solid rgba(176, 160, 232, 0.5)",
                  }}
                >
                  Applied: {appliedClarification}
                </div>
              )}
              {feedback && (
                <div
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    whiteSpace: "pre-line",
                  }}
                >
                  {feedback}
                </div>
              )}
              {clarificationOptions.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {clarificationOptions.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const selectedCandidate = pendingCommand?.candidateStudents.find((c) => c.displayName === opt);
                        if (pendingCommand && selectedCandidate) {
                          setPhase("processing");
                          const result = await resumePendingVoiceCommand(
                            pendingCommand,
                            { studentId: selectedCandidate.id },
                            {
                              students: dataRef.current.students,
                              lessons: dataRef.current.lessons,
                              getScheduledLessonsForDate,
                              updateLessonById: (lessonId, updates) => updateLesson(lessonId, updates),
                              addLesson: (lesson) => addLesson(lesson),
                              fetchLessonsForVerification: async (): Promise<Lesson[]> => {
                                if (hasSupabase() && dataRef.current.user?.id) {
                                  return fetchLessons(dataRef.current.user.id);
                                }
                                await new Promise((r) => setTimeout(r, 0));
                                return dataRef.current.lessons;
                              },
                            },
                            {
                              debug: import.meta.env.DEV || (canUseDebug && debugMode),
                              dryRun: canUseDebug && dryRunMode,
                            }
                          );
                          if (result.plan?.target_date && result.plan.target_date !== dateKey && onDateChange) {
                            onDateChange(new Date(`${result.plan.target_date}T12:00:00`));
                          }
                          setAppliedClarification(result.status === "success" ? opt : null);
                          setFeedback(result.human_message);
                          setClarificationOptions(result.clarification_options ?? []);
                          setPendingCommand(result.pending_command ?? null);
                          setUnmatchedItems([]);
                          setDebugPayload(result.debug ?? null);
                          setPhase("result");
                          return;
                        }
                        const clarified = applyClarificationOption(transcript, opt);
                        setAppliedClarification(opt);
                        await runVoiceCommand(clarified);
                      }}
                      style={{ justifyContent: "flex-start" }}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              )}
              {unmatchedItems.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  {unmatchedItems.map((u, i) => (
                    <div key={i}>
                      {u.reason === "not_found" &&
                        `Could not find "${u.text}" in your students.`}
                      {u.reason === "ambiguous" &&
                        `"${u.text}" matches multiple students.`}
                      {(u.reason === "no_lessons_on_date" ||
                        u.reason === "not_scheduled_today") &&
                        `"${u.text}" is not scheduled on this date.`}
                    </div>
                  ))}
                </div>
              )}
              {/* Try again / close buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    closePanel();
                    setTimeout(startListening, 100);
                  }}
                >
                  Try again
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={closePanel}
                >
                  Done
                </Button>
              </div>
              {canUseDebug && debugMode && debugPayload && (
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Debug details</summary>
                  <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-muted)" }}>
                    <div>Transcript: {debugPayload.transcriptRaw}</div>
                    <div>Normalized: {debugPayload.transcriptNormalized ?? "—"}</div>
                    <div>Intent: {debugPayload.intent?.name ?? "—"}</div>
                    <div>UI selected date: {debugPayload.uiSelectedDate ?? "—"}</div>
                    <div>Resolved date: {debugPayload.resolvedDate ?? "—"}</div>
                    <div>Timezone: {debugPayload.timezone}</div>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>Parsed entities</summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowX: "auto",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {JSON.stringify(debugPayload.entities ?? {}, null, 2)}
                      </pre>
                    </details>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>Student resolution</summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowX: "auto",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {JSON.stringify(debugPayload.studentResolution ?? [], null, 2)}
                      </pre>
                    </details>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>Lesson resolution + plan</summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowX: "auto",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {JSON.stringify(
                          {
                            lessonResolution: debugPayload.lessonResolution ?? [],
                            plan: debugPayload.plan ?? {},
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>Mutation / data calls</summary>
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowX: "auto",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {JSON.stringify(debugPayload.supabase ?? [], null, 2)}
                      </pre>
                    </details>
                    {!!(debugPayload.warnings?.length || debugPayload.errors?.length) && (
                      <pre
                        style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowX: "auto",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        }}
                      >
                        {JSON.stringify(
                          {
                            warnings: debugPayload.warnings ?? [],
                            errors: debugPayload.errors ?? [],
                          },
                          null,
                          2
                        )}
                      </pre>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
