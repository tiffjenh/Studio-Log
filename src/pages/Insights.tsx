import { useMemo } from "react";
import { useStoreContext } from "@/context/StoreContext";
import { dedupeLessons, getEffectiveRateCents } from "@/utils/earnings";
import type { StudentSummary } from "@/lib/forecasts/types";
import ForecastsPanel from "@/components/forecasts/ForecastsPanel";

export default function Insights() {
  const { data } = useStoreContext();
  const completedLessons = dedupeLessons(data.lessons.filter((l) => l.completed));
  const studentById = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);

  const earnings = useMemo(
    () =>
      completedLessons.map((l) => {
        const student = studentById.get(l.studentId);
        const name = student ? `${student.firstName} ${student.lastName}` : undefined;
        return {
          date: l.date,
          amount: l.amountCents / 100,
          durationMinutes: l.durationMinutes,
          customer: name,
          studentId: l.studentId,
        };
      }),
    [completedLessons, studentById]
  );

  const students: StudentSummary[] = useMemo(
    () =>
      data.students
        .filter((s) => !s.terminatedFromDate || s.terminatedFromDate > new Date().toISOString().slice(0, 10))
        .map((s) => ({
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          rateCents: getEffectiveRateCents(s, new Date().toISOString().slice(0, 10)),
          durationMinutes: s.durationMinutes,
        })),
    [data.students]
  );

  return (
    <div style={{ width: "100%" }}>
      <h1 className="headline-serif" style={{ fontSize: 28, fontWeight: 400, margin: "0 0 20px" }}>
        Insights
      </h1>
      <ForecastsPanel
        earnings={earnings}
        students={students}
        rangeContext={{ mode: "forecasts" }}
        voiceButtonPosition="floating"
        searchLayout="stacked"
      />
    </div>
  );
}
