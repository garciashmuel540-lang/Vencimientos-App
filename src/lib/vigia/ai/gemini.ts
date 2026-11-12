const model = "gemini-3.1-flash-lite";

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
type Content = { role: "user" | "model"; parts: Part[] };

export async function geminiJson(contents: Content[], maxOutputTokens: number, system?: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(14000),
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { responseMimeType: "application/json", maxOutputTokens },
      }),
    },
  );
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw Object.assign(new Error("Gemini request failed"), {
      status: response.status,
      headers: response.headers,
    });
  }
  const data = (await response.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
  };
  const candidate = data.candidates?.[0];
  return candidate?.finishReason === "STOP"
    ? candidate.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("") || null
    : null;
}
