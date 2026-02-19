/** Categories and suggested questions for the Insights page. */

export const INSIGHTS_CATEGORIES = [
  {
    label: "Revenue & Forecasting",
    questions: [
      "Am I on track for $80k this year?",
      "What was my total revenue last month?",
      "What is my projected earnings this year?",
      "How much will I earn this month?",
      "Show my earnings summary",
    ],
  },
  {
    label: "Capacity Planning",
    questions: [
      "How many students do I need to reach $100k at $70/hr?",
      "How many more students to reach $80,000/year?",
      "What does $100,000/year require at my current rates?",
    ],
  },
  {
    label: "Pricing & Rate Optimization",
    questions: [
      "Who pays the most per hour?",
      "What is my average hourly rate?",
      "Who is below my average rate?",
      "If I raise rates by $10/hour, what happens to my income?",
    ],
  },
  {
    label: "Student Insights",
    questions: [
      "Who pays the most?",
      "Which student earned me the most?",
      "Who pays the least?",
      "Revenue per student breakdown",
    ],
  },
  {
    label: "Cash Flow & Stability",
    questions: [
      "Is my income stable or volatile?",
      "What's my cash flow trend?",
      "How much do I earn on average per week?",
    ],
  },
  {
    label: "Operational Metrics",
    questions: [
      "How many lessons did I teach last month?",
      "What's my revenue per lesson?",
      "What day of the week do I earn the most?",
      "Average lessons per week",
    ],
  },
  {
    label: "Tax & Financial Planning",
    questions: [
      "How much should I set aside for taxes?",
      "Estimated tax on my income this year?",
      "What do I need to set aside for quarterly taxes?",
    ],
  },
  {
    label: "Scenario / What-If",
    questions: [
      "If I add 3 new students, what's my new income?",
      "If I take 2 weeks off, how does that affect my yearly earnings?",
      "What if I lose my top 2 students?",
    ],
  },
  {
    label: "Comparisons & Benchmarks",
    questions: [
      "What was my best month?",
      "What was my worst month?",
      "Compare this month to last month",
      "Year-over-year growth?",
    ],
  },
  {
    label: "Advanced Insights",
    questions: [
      "Revenue concentration: top 3 students?",
      "What percentage of revenue comes from my top students?",
      "Most profitable time of day?",
    ],
  },
] as const;

export const SUGGESTION_CHIPS = [
  "Am I on track for $80k this year?",
  "Who pays the most per hour?",
  "What was my best month?",
  "How many students to reach $100k at $70/hr?",
  "How much should I set aside for taxes?",
] as const;
