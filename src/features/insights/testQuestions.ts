export type TestQuestion = {
  question: string;
  expectedIntent: string;
  expectedMetric: string;
  expectedClarificationNeeded: boolean;
  notes: string;
};

const base: TestQuestion[] = [
  { question: "who missed the most lessons in 2025?", expectedIntent: "student_missed_most_lessons_in_year", expectedMetric: "missed_count", expectedClarificationNeeded: false, notes: "core missed query" },
  { question: "which student has the highest hourly rate?", expectedIntent: "student_highest_hourly_rate", expectedMetric: "hourly_dollars", expectedClarificationNeeded: false, notes: "core rate high" },
  { question: "who pays the least per hour?", expectedIntent: "student_lowest_hourly_rate", expectedMetric: "hourly_dollars", expectedClarificationNeeded: false, notes: "core rate low" },
  { question: "who is below my average hourly rate?", expectedIntent: "students_below_average_rate", expectedMetric: "avg_hourly_dollars", expectedClarificationNeeded: false, notes: "core below avg" },
  { question: "how much did i earn in jan 2026?", expectedIntent: "earnings_in_period", expectedMetric: "total_dollars", expectedClarificationNeeded: false, notes: "month query" },
  { question: "how much did leo chen earn me ytd?", expectedIntent: "earnings_ytd_for_student", expectedMetric: "total_dollars", expectedClarificationNeeded: false, notes: "student ytd" },
  { question: "top 3 students by revenue last year", expectedIntent: "revenue_per_student_in_period", expectedMetric: "rows", expectedClarificationNeeded: false, notes: "ranking" },
  { question: "what % more did i make in 2025 than 2024?", expectedIntent: "percent_change_yoy", expectedMetric: "percent_change", expectedClarificationNeeded: false, notes: "percent yoy" },
  { question: "what is my average hourly rate this month?", expectedIntent: "average_hourly_rate_in_period", expectedMetric: "hourly_dollars", expectedClarificationNeeded: false, notes: "avg rate period" },
  { question: "projected monthly earnings", expectedIntent: "forecast_monthly", expectedMetric: "projected_monthly_dollars", expectedClarificationNeeded: false, notes: "forecast monthly" },
  { question: "projected yearly earnings", expectedIntent: "forecast_yearly", expectedMetric: "projected_yearly_dollars", expectedClarificationNeeded: false, notes: "forecast yearly" },
  { question: "mark attendance things maybe", expectedIntent: "clarification", expectedMetric: "clarify", expectedClarificationNeeded: true, notes: "ambiguous fallback" },
];

const paraphrases = [
  "who had the most no-shows in 2025",
  "highest paying student per hour",
  "which student is the cheapest hourly",
  "students under my average rate",
  "earnings for january 2026",
  "leo chen ytd earnings",
  "show revenue by student last year",
  "2025 vs 2024 percent increase",
  "average hourly this month",
  "monthly forecast please",
  "yearly forecast please",
  "what do you mean",
];

const groups: Array<{ seed: TestQuestion; phrases: string[] }> = [
  { seed: base[0]!, phrases: ["who missed the most in 2025", "which student missed most lessons in 2025", "most absences in 2025"] },
  { seed: base[1]!, phrases: ["highest hourly student", "who has highest hourly rate", "who is highest paying per hour"] },
  { seed: base[2]!, phrases: ["lowest hourly student", "who is lowest per hour", "least hourly rate student"] },
  { seed: base[3]!, phrases: ["below average hourly", "students below my average", "who is under average rate"] },
  { seed: base[4]!, phrases: ["revenue in jan 2026", "earnings jan 2026", "how much in january 2026"] },
  { seed: base[5]!, phrases: ["leo chen ytd total", "ytd from leo chen", "leo chen year to date earnings"] },
  { seed: base[6]!, phrases: ["top 3 by revenue last year", "revenue ranking last year", "student revenue breakdown last year"] },
  { seed: base[7]!, phrases: ["percent growth 2025 vs 2024", "2025 compared to 2024 percentage", "what percent increase 2025 over 2024"] },
  { seed: base[8]!, phrases: ["avg hourly this month", "what is hourly average this month", "average rate in this month"] },
  { seed: base[9]!, phrases: ["forecast this month", "monthly projection", "expected monthly projection"] },
  { seed: base[10]!, phrases: ["forecast this year", "yearly projection", "expected yearly projection"] },
  { seed: base[11]!, phrases: ["not sure question", "something random", "help me maybe"] },
];

const generated: TestQuestion[] = [];
for (const group of groups) {
  for (let i = 0; i < 4; i++) {
    const phrase = group.phrases[i % group.phrases.length] ?? paraphrases[i % paraphrases.length];
    generated.push({
      question: `${phrase}${i % 2 === 0 ? " please" : ""}`,
      expectedIntent: group.seed.expectedIntent,
      expectedMetric: group.seed.expectedMetric,
      expectedClarificationNeeded: group.seed.expectedClarificationNeeded,
      notes: `generated-${group.seed.expectedIntent}-${i + 1}`,
    });
  }
}

export const INSIGHTS_TEST_QUESTIONS: TestQuestion[] = [...base, ...generated];
