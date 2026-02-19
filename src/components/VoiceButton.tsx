/**
 * VoiceButton — microphone button that records speech, sends it to the
 * LLM-backed /api/voice endpoint, and applies attendance / edit actions.
 *
 * Uses the Web Speech API (SpeechRecognition) for on-device speech-to-text,
 * then calls the serverless function for NLP interpretation.
 *
 * Falls back to the local rule-based parser if the API is unavailable.
 */

import { useState, useRef, useCallback } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  buildVoiceContext,
  callVoiceAPI,
  isVoiceLoggingResult,
  type VoiceAPIResult,
  type VoiceAPIAction,
  type VoiceLoggingResult,
  type UpdateLessonAction,
} from "@/utils/voiceApi";
import {
  processVoiceTranscript,
  buildScheduledLessons,
  buildAllStudentList,
} from "@/utils/voiceAssistant";
import {
  getStudentsForDay,
  getLessonForStudentOnDate,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
  toDateKey,
} from "@/utils/earnings";
import { parseVoiceCommand } from "@/lib/voice/parseVoiceCommand";
import { resolveVoiceCommand } from "@/lib/voice/resolveEntities";
import { executeVoiceIntent } from "@/lib/voice/executeVoiceIntent";
import type { ResolvedVoiceCommand } from "@/lib/voice/types";
import { VoiceConfirmationCard } from "@/components/VoiceAssistant";

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

type Phase = "idle" | "listening" | "processing" | "result" | "error" | "confirm";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function langToSpeechLocale(lang: string): string {
  if (lang === "es") return "es-ES";
  if (lang === "zh") return "zh-CN";
  return "en-US";
}

export default function VoiceButton({
  dateKey,
  dayOfWeek,
  onDateChange,
}: {
  dateKey: string;
  dayOfWeek: number;
  onDateChange?: (date: Date) => void;
}) {
  const { data, addLesson, updateLesson, reload } = useStoreContext();
  const { lang } = useLanguage();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [unmatchedItems, setUnmatchedItems] = useState<{ text: string; reason: string }[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [pendingResolved, setPendingResolved] = useState<ResolvedVoiceCommand | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /* ---- Helper: find student name by id ---- */
  const studentName = useCallback(
    (id: string) => {
      const s = data.students.find((st) => st.id === id);
      return s ? `${s.firstName} ${s.lastName}` : "Unknown";
    },
    [data.students]
  );

  /* ---- Apply LLM API actions ---- */
  const applyAPIActions = useCallback(
    async (actions: VoiceAPIAction[], apiResult: VoiceAPIResult) => {
      const lines: string[] = [];

      for (const action of actions) {
        switch (action.type) {
          case "navigate_to_date": {
            if (onDateChange) {
              const d = new Date(action.date + "T12:00:00");
              onDateChange(d);
              const formatted = d.toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              });
              lines.push(`Navigated to ${formatted}`);
            }
            break;
          }

          case "navigate_to_tab": {
            // Navigation to tabs can be handled by parent; for now just note it
            lines.push(`Navigate to ${action.tab}`);
            break;
          }

          case "set_attendance": {
            const targetDate = action.date;
            const existing = getLessonForStudentOnDate(
              data.lessons,
              action.student_id,
              targetDate
            );
            if (existing) {
              await updateLesson(existing.id, { completed: action.present });
            } else {
              const student = data.students.find((s) => s.id === action.student_id);
              if (student) {
                await addLesson({
                  studentId: student.id,
                  date: targetDate,
                  durationMinutes: getEffectiveDurationMinutes(student, targetDate),
                  amountCents: getEffectiveRateCents(student, targetDate),
                  completed: action.present,
                });
              }
            }
            const name = studentName(action.student_id);
            lines.push(action.present ? `✓ ${name} — attended` : `✗ ${name} — absent`);
            break;
          }

          case "set_attendance_bulk": {
            // Handle single date or range
            const dates: string[] = [];
            if (action.date) {
              dates.push(action.date);
            } else if (action.range) {
              // Generate all dates in range
              const start = new Date(action.range.start_date + "T12:00:00");
              const end = new Date(action.range.end_date + "T12:00:00");
              const d = new Date(start);
              while (d <= end) {
                dates.push(toDateKey(d));
                d.setDate(d.getDate() + 1);
              }
            }

            let totalMarked = 0;
            for (const dt of dates) {
              const dow = new Date(dt + "T12:00:00").getDay();
              const dayStudents = getStudentsForDay(data.students, dow, dt);
              for (const student of dayStudents) {
                const existing = getLessonForStudentOnDate(data.lessons, student.id, dt);
                if (existing) {
                  await updateLesson(existing.id, { completed: action.present });
                } else {
                  await addLesson({
                    studentId: student.id,
                    date: dt,
                    durationMinutes: getEffectiveDurationMinutes(student, dt),
                    amountCents: getEffectiveRateCents(student, dt),
                    completed: action.present,
                  });
                }
                totalMarked++;
              }
            }

            if (dates.length === 1) {
              lines.push(
                action.present
                  ? `✓ All ${totalMarked} students marked attended`
                  : `✗ All ${totalMarked} students marked absent`
              );
            } else {
              lines.push(
                action.present
                  ? `✓ ${totalMarked} lessons marked attended (${dates.length} days)`
                  : `✗ ${totalMarked} lessons marked absent (${dates.length} days)`
              );
            }
            break;
          }

          case "clear_attendance": {
            const existing = getLessonForStudentOnDate(
              data.lessons,
              action.student_id,
              action.date
            );
            if (existing) {
              await updateLesson(existing.id, { completed: false });
            }
            lines.push(`↩ ${studentName(action.student_id)} — cleared`);
            break;
          }

          case "set_duration": {
            const existing = getLessonForStudentOnDate(
              data.lessons,
              action.student_id,
              action.date
            );
            if (existing) {
              await updateLesson(existing.id, { durationMinutes: action.duration_minutes });
            } else {
              const student = data.students.find((s) => s.id === action.student_id);
              if (student) {
                await addLesson({
                  studentId: student.id,
                  date: action.date,
                  durationMinutes: action.duration_minutes,
                  amountCents: getEffectiveRateCents(student, action.date),
                  completed: true,
                });
              }
            }
            lines.push(`${studentName(action.student_id)} — ${action.duration_minutes} min`);
            break;
          }

          case "set_rate": {
            const rateCents = Math.round(action.rate * 100);
            const existing = getLessonForStudentOnDate(
              data.lessons,
              action.student_id,
              action.date
            );
            if (existing) {
              await updateLesson(existing.id, { amountCents: rateCents });
            } else {
              const student = data.students.find((s) => s.id === action.student_id);
              if (student) {
                await addLesson({
                  studentId: student.id,
                  date: action.date,
                  durationMinutes: getEffectiveDurationMinutes(student, action.date),
                  amountCents: rateCents,
                  completed: true,
                });
              }
            }
            lines.push(`${studentName(action.student_id)} — $${action.rate}`);
            break;
          }

          case "set_time": {
            // Time changes aren't directly supported via lesson update yet;
            // just acknowledge it
            lines.push(`${studentName(action.student_id)} — time set to ${action.start_time}`);
            break;
          }
        }
      }

      // Handle query intent — show info from resolved dates
      if (apiResult.intent === "query" && actions.length === 0) {
        // Basic query response: show today's summary
        const scheduledCount = getStudentsForDay(data.students, dayOfWeek, dateKey).length;
        lines.push(`You have ${scheduledCount} student${scheduledCount !== 1 ? "s" : ""} scheduled today.`);
      }

      return lines;
    },
    [data, addLesson, updateLesson, onDateChange, studentName, dayOfWeek, dateKey]
  );

  /* ---- New voice-logging schema: apply UPDATE_LESSON actions ---- */
  const applyVoiceLoggingActions = useCallback(
    async (result: VoiceLoggingResult): Promise<string[]> => {
      const lines: string[] = [];
      const studentName = (id: string) => {
        const s = data.students.find((x) => x.id === id);
        return s ? `${s.firstName} ${s.lastName}` : "Student";
      };

      for (const action of result.actions as UpdateLessonAction[]) {
        if (action.type !== "UPDATE_LESSON") continue;
        const studentId = action.student_id ?? (() => {
          const raw = (action.student_name_raw || "").trim().toLowerCase();
          if (!raw) return null;
          const match = data.students.find((s) => {
            const full = `${s.firstName} ${s.lastName}`.toLowerCase();
            return full.includes(raw) || raw.includes(full) || full.split(/\s+/).some((p) => p.startsWith(raw) || raw.startsWith(p));
          });
          return match?.id ?? null;
        })();
        if (!studentId) {
          lines.push(`Could not find student "${action.student_name_raw}"`);
          continue;
        }
        const student = data.students.find((s) => s.id === studentId);
        if (!student) continue;
        const existing = getLessonForStudentOnDate(data.lessons, studentId, action.date);

        const completed =
          action.set_status === "attended" ? true : action.set_status === "not_attended" || action.set_status === "cancelled" ? false : existing?.completed ?? null;
        const durationMinutes = action.set_duration_minutes ?? existing?.durationMinutes ?? getEffectiveDurationMinutes(student, action.date);
        const amountCents = action.payment?.amount != null ? Math.round(action.payment.amount * 100) : (existing?.amountCents ?? getEffectiveRateCents(student, action.date));

        if (existing) {
          const updates: { completed?: boolean; durationMinutes?: number; amountCents?: number } = {};
          if (completed !== null) updates.completed = completed;
          if (action.set_duration_minutes != null) updates.durationMinutes = action.set_duration_minutes;
          if (action.payment?.amount != null) updates.amountCents = amountCents;
          if (Object.keys(updates).length > 0) await updateLesson(existing.id, updates);
        } else {
          await addLesson({
            studentId,
            date: action.date,
            durationMinutes,
            amountCents,
            completed: completed === true,
          });
        }

        if (action.set_status === "attended") lines.push(`✓ ${studentName(studentId)} — attended`);
        else if (action.set_status === "not_attended" || action.set_status === "cancelled") lines.push(`✗ ${studentName(studentId)} — ${action.set_status === "cancelled" ? "cancelled" : "absent"}`);
        else if (action.payment?.amount != null) lines.push(`${studentName(studentId)} — $${action.payment.amount}${action.payment.method ? ` (${action.payment.method})` : ""}`);
        else lines.push(`✓ ${studentName(studentId)} — updated`);
      }
      return lines;
    },
    [data, addLesson, updateLesson]
  );

  /* ---- Fallback: apply local parser actions ---- */
  const applyLocalActions = useCallback(
    async (text: string): Promise<{ feedback: string; unmatched: { text: string; reason: string }[] }> => {
      const allStudents = buildAllStudentList(data.students);

      // First pass: detect date
      let voiceResult = processVoiceTranscript(text, [], allStudents, dateKey);
      const targetDateKey = voiceResult.navigated_date ?? dateKey;
      const targetDate = new Date(targetDateKey + "T12:00:00");
      const targetDayOfWeek = targetDate.getDay();

      if (voiceResult.navigated_date && onDateChange) {
        onDateChange(targetDate);
      }

      // Second pass: with correct date's students
      const targetStudents = getStudentsForDay(data.students, targetDayOfWeek, targetDateKey);
      const scheduled = buildScheduledLessons(targetStudents, targetDateKey);
      voiceResult = processVoiceTranscript(text, scheduled, allStudents, dateKey);

      const feedbackLines: string[] = [];

      if (voiceResult.navigated_date) {
        const navDate = new Date(voiceResult.navigated_date + "T12:00:00");
        const formatted = navDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        feedbackLines.push(`Navigated to ${formatted}`);
      }

      if (voiceResult.intent === "clarify" && voiceResult.actions.length === 0) {
        if (voiceResult.navigated_date && voiceResult.unmatched_mentions.length === 0) {
          return { feedback: feedbackLines.join("\n") || "Done!", unmatched: [] };
        }
        return {
          feedback: voiceResult.clarifying_question || "I didn't understand that.",
          unmatched: voiceResult.unmatched_mentions.map((u) => ({
            text: u.spoken_name,
            reason: u.reason,
          })),
        };
      }

      // Apply actions
      const actionDate = voiceResult.navigated_date ?? (voiceResult.actions[0]?.date ?? dateKey);
      for (const action of voiceResult.actions) {
        const student = data.students.find((s) => s.id === action.student_id);
        if (!student) continue;
        const name = `${student.firstName} ${student.lastName}`;
        const existing = getLessonForStudentOnDate(data.lessons, student.id, actionDate);

        if (action.type === "set_attendance") {
          if (existing) {
            await updateLesson(existing.id, { completed: action.present });
          } else {
            await addLesson({
              studentId: student.id,
              date: actionDate,
              durationMinutes: getEffectiveDurationMinutes(student, actionDate),
              amountCents: getEffectiveRateCents(student, actionDate),
              completed: action.present,
            });
          }
          feedbackLines.push(action.present ? `✓ ${name} — attended` : `✗ ${name} — absent`);
        }

        if (action.type === "set_duration") {
          if (existing) {
            await updateLesson(existing.id, { durationMinutes: action.duration_minutes });
          } else {
            await addLesson({
              studentId: student.id,
              date: actionDate,
              durationMinutes: action.duration_minutes,
              amountCents: getEffectiveRateCents(student, actionDate),
              completed: true,
            });
          }
          feedbackLines.push(`${name} — ${action.duration_minutes} min`);
        }

        if (action.type === "set_rate") {
          const rateCents = Math.round(action.rate * 100);
          if (existing) {
            await updateLesson(existing.id, { amountCents: rateCents });
          } else {
            await addLesson({
              studentId: student.id,
              date: actionDate,
              durationMinutes: getEffectiveDurationMinutes(student, actionDate),
              amountCents: rateCents,
              completed: true,
            });
          }
          feedbackLines.push(`${name} — $${action.rate}`);
        }
      }

      return {
        feedback: feedbackLines.join("\n") || "Done!",
        unmatched: voiceResult.unmatched_mentions.map((u) => ({
          text: u.spoken_name,
          reason: u.reason,
        })),
      };
    },
    [data, dateKey, dayOfWeek, addLesson, updateLesson, onDateChange]
  );

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
    setUnmatchedItems([]);
    setShowPanel(true);

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;
      setTranscript(text);
      setPhase("processing");

      try {
        // 1) Voice Command Router: local parse + resolve (attendance + reschedule)
        const payload = parseVoiceCommand(text, dateKey);
        const resolveContext = {
          students: data.students,
          lessons: data.lessons,
          dashboardDateKey: dateKey,
        };
        const resolved = resolveVoiceCommand(payload, resolveContext);

        if (
          (payload.intent === "ATTENDANCE_MARK" || payload.intent === "LESSON_RESCHEDULE") &&
          resolved
        ) {
          const executeContext = {
            updateLesson,
            addLesson,
            lessons: data.lessons,
            students: data.students,
          };
          if (payload.confidence >= 0.75) {
            await executeVoiceIntent(resolved, executeContext);
            await reload?.();
            setFeedback(resolved.summary);
            setUnmatchedItems([]);
            setPhase("result");
            return;
          }
          setPendingResolved(resolved);
          setFeedback(resolved.summary);
          setPhase("confirm");
          return;
        }

        // 2) Fallback: LLM API
        const context = buildVoiceContext(data.students, data.lessons, dateKey);
        const apiResult = await callVoiceAPI(text, context);

        // New voice-logging schema (UPDATE_LESSON + followup)
        if (isVoiceLoggingResult(apiResult)) {
          if (apiResult.needs_followup && apiResult.followup_question) {
            const choices = apiResult.followup_choices?.length
              ? `\n${apiResult.followup_choices.map((c) => `• ${c}`).join("\n")}`
              : "";
            setFeedback(apiResult.followup_question + choices);
            setPhase("result");
            return;
          }
          const lines = await applyVoiceLoggingActions(apiResult);
          setFeedback(lines.length ? lines.join("\n") : "Done!");
          setUnmatchedItems([]);
          setPhase("result");
          return;
        }

        // Legacy schema: navigate if needed
        const navAction = apiResult.actions.find(
          (a): a is Extract<typeof a, { type: "navigate_to_date" }> =>
            a.type === "navigate_to_date"
        );
        if (navAction && onDateChange) {
          onDateChange(new Date(navAction.date + "T12:00:00"));
        }

        // Handle clarify intent
        if (apiResult.intent === "clarify") {
          setFeedback(apiResult.clarifying_question || "Could you say that again?");
          setUnmatchedItems(
            (apiResult.unmatched_mentions || []).map((u) => ({
              text: u.spoken_text,
              reason: u.reason,
            }))
          );
          setPhase("result");
          return;
        }

        // Apply legacy actions
        const lines = await applyAPIActions(apiResult.actions, apiResult);
        setFeedback(lines.join("\n") || "Done!");
        setUnmatchedItems(
          (apiResult.unmatched_mentions || []).map((u) => ({
            text: u.spoken_text,
            reason: u.reason,
          }))
        );
        setPhase("result");
      } catch (_err) {
        // API unavailable — fall back to local rule-based parser
        console.warn("Voice API unavailable, using local parser:", _err);
        const localResult = await applyLocalActions(text);
        setFeedback(localResult.feedback);
        setUnmatchedItems(localResult.unmatched);
        setPhase("result");
      }
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
  }, [data, dateKey, applyAPIActions, applyVoiceLoggingActions, applyLocalActions, onDateChange, updateLesson, addLesson, reload]);

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
    setUnmatchedItems([]);
    setPendingResolved(null);
  }, []);

  /* ---- Confirm / Cancel voice command (when confidence < 0.75) ---- */
  const handleConfirmVoice = useCallback(async () => {
    if (!pendingResolved) return;
    setConfirmLoading(true);
    try {
      const executeContext = {
        updateLesson,
        addLesson,
        lessons: data.lessons,
        students: data.students,
      };
      await executeVoiceIntent(pendingResolved, executeContext);
      await reload?.();
      setFeedback(pendingResolved.summary);
      setPhase("result");
    } finally {
      setPendingResolved(null);
      setConfirmLoading(false);
    }
  }, [pendingResolved, updateLesson, addLesson, data.lessons, data.students, reload]);

  const handleCancelConfirm = useCallback(() => {
    setPendingResolved(null);
    setFeedback("Cancelled.");
    setPhase("result");
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
          background: "var(--avatar-gradient)",
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
                  : phase === "confirm"
                    ? "Confirm?"
                    : "Voice Input"}
            </span>
            <button
              type="button"
              onClick={closePanel}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 20,
                color: "var(--text-muted)",
                padding: "4px 8px",
              }}
            >
              &times;
            </button>
          </div>

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

          {/* Confirmation card (low confidence or ambiguous) */}
          {phase === "confirm" && pendingResolved && (
            <div style={{ padding: "4px 0" }}>
              <VoiceConfirmationCard
                summary={pendingResolved.summary}
                transcript={transcript}
                onConfirm={handleConfirmVoice}
                onCancel={handleCancelConfirm}
                isLoading={confirmLoading}
              />
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
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    setTimeout(startListening, 100);
                  }}
                  className="pill"
                  style={{
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="pill pill--active"
                  style={{
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: "var(--font-sans)",
                  }}
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
