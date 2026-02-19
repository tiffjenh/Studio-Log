/**
 * Language detection for Insights queries and response translation.
 * Used to return answers in the same language the user spoke.
 */

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const SPANISH_INDICATORS =
  /\b(cuánto|cuantas|cuántos|ganaré|ganar|necesito|estudiantes|tarifa|promedio|hora|este\s+mes|cuál|qué|si\s+aumento|impuesto|reserva)\b/i;

export type QueryLanguage = "en" | "es" | "zh";

/**
 * Detect the language of an Insights search query (en, es, or zh).
 * Used to decide whether to translate the AI response.
 */
export function detectQueryLanguage(query: string): QueryLanguage {
  const t = query.trim();
  if (!t) return "en";
  if (CJK_RANGE.test(t)) return "zh";
  if (SPANISH_INDICATORS.test(t)) return "es";
  return "en";
}

/**
 * Call the /api/translate endpoint to translate text to Spanish or Chinese.
 * Returns the original text if the request fails.
 */
export async function translateForInsights(text: string, targetLang: "es" | "zh"): Promise<string> {
  if (!text.trim()) return text;
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang }),
    });
    if (!res.ok) return text;
    const data = (await res.json()) as { translated?: string };
    return typeof data.translated === "string" ? data.translated : text;
  } catch {
    return text;
  }
}
