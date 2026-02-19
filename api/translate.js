/**
 * Vercel Serverless Function — /api/translate
 *
 * Translates text to the target language (es or zh) using OpenAI.
 * POST body: { text: string, targetLang: "es" | "zh" }
 * Returns: { translated: string }
 * Requires OPENAI_API_KEY in Vercel.
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

  const { text, targetLang } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" });
  if (targetLang !== "es" && targetLang !== "zh") return res.status(400).json({ error: "targetLang must be 'es' or 'zh'" });

  const langName = targetLang === "es" ? "Spanish" : "Simplified Chinese (Mandarin)";
  const systemPrompt = `You are a translator. Translate the following text to ${langName}. Preserve numbers, currency symbols ($), and line breaks. Output only the translation, no explanations.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("OpenAI translate error:", response.status, errBody);
      return res.status(502).json({ error: "Translation failed" });
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim() ?? text;
    return res.status(200).json({ translated });
  } catch (err) {
    console.error("Translate API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
