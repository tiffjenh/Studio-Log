import { useMemo, useState } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { Button } from "@/components/ui/Button";
import {
  handleVoiceCommand,
  type DashboardContext,
  type DashboardScheduledLesson,
} from "@/lib/voice/homeVoicePipeline";
import {
  getStudentsForDay,
  getLessonForStudentOnDate,
  getEffectiveDurationMinutes,
  getEffectiveRateCents,
} from "@/utils/earnings";

function getScheduledLessonsForDate(
  targetDateKey: string,
  students: ReturnType<typeof useStoreContext>["data"]["students"],
  lessons: ReturnType<typeof useStoreContext>["data"]["lessons"]
): DashboardScheduledLesson[] {
  const targetDate = new Date(`${targetDateKey}T12:00:00`);
  const dow = targetDate.getDay();
  const byDay = getStudentsForDay(students, dow, targetDateKey);
  return byDay.map((s) => {
    const lesson = getLessonForStudentOnDate(lessons, s.id, targetDateKey);
    return {
      lesson_id: lesson?.id ?? null,
      student_id: s.id,
      student_name: `${s.firstName} ${s.lastName}`,
      date: targetDateKey,
      time: lesson?.timeOfDay ?? s.timeOfDay ?? "",
      duration_minutes: lesson?.durationMinutes ?? getEffectiveDurationMinutes(s, targetDateKey),
      amount_cents: lesson?.amountCents ?? getEffectiveRateCents(s, targetDateKey),
      completed: lesson?.completed ?? false,
    };
  });
}

export default function VoiceDebugPage() {
  const { data } = useStoreContext();
  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }, []);

  const [transcript, setTranscript] = useState("Change Sophia's lesson to 1 PM");
  const [dateKey, setDateKey] = useState(todayKey);
  const [dryRun, setDryRun] = useState(true);
  const [resultJson, setResultJson] = useState<string>("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const context: DashboardContext = {
        user_id: data.user?.id ?? "local-user",
        selected_date: dateKey,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        scheduled_lessons: getScheduledLessonsForDate(dateKey, data.students, data.lessons),
      };
      const result = await handleVoiceCommand(
        transcript,
        context,
        {
          students: data.students,
          lessons: data.lessons,
          getScheduledLessonsForDate: (dk: string) =>
            getScheduledLessonsForDate(dk, data.students, data.lessons),
          updateLessonById: async () => {},
          addLesson: async () => "",
          fetchLessonsForVerification: async () => data.lessons,
        },
        { debug: true, dryRun }
      );
      setResultJson(JSON.stringify(result, null, 2));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "20px auto", padding: "0 16px 24px" }}>
      <h2 className="headline-serif" style={{ marginBottom: 8 }}>Voice Debug Harness</h2>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Dev tool for transcript -&gt; intent -&gt; plan debugging.
      </p>
      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        <label>
          Transcript
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 8 }}
          />
        </label>
        <label>
          Selected date
          <input
            type="date"
            value={dateKey}
            onChange={(e) => setDateKey(e.target.value)}
            style={{ marginLeft: 8 }}
          />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (no mutations)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="button" variant="primary" onClick={run} disabled={running}>
            {running ? "Running..." : "Run debug"}
          </Button>
        </div>
      </div>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "rgba(0,0,0,0.03)",
          padding: 12,
          borderRadius: 10,
          overflowX: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
        }}
      >
        {resultJson || "Run a transcript to see debug payload."}
      </pre>
    </div>
  );
}
