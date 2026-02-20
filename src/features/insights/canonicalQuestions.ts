import { INSIGHTS_CATEGORIES } from "@/pages/insightsConstants";

export type CanonicalInsightQuestion = {
  category: string;
  question: string;
};

export function getCanonicalInsightsQuestions(): CanonicalInsightQuestion[] {
  return INSIGHTS_CATEGORIES.flatMap((cat) =>
    cat.questions.map((question) => ({
      category: cat.label,
      question,
    }))
  );
}
